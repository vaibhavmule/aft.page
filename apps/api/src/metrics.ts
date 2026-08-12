/**
 * Product metrics via Workers Analytics Engine.
 *
 * Schema (dataset: aft_page_metrics):
 *   indexes[0]  event        deploy | page_view | serve | claim | redeploy | waitlist | feedback | mcp | cli
 *   blobs[0]    source       mcp | web | extension | curl | cli | mac | other
 *                (mcp event: JSON-RPC method)
 *   blobs[1]    status       ok | error code (no_files, …) — cli: command name
 *   blobs[2]    slug         site slug when known (mcp: tool; cli: CLI version)
 *   blobs[3]    deployer     sha256(cf-connecting-ip)[:16] — approx unique
 *   blobs[4]    path         failing file path when known
 *   blobs[5]    request_id   cf-ray or generated id
 *   doubles[0]  ms           deploy duration
 *   doubles[1]  bytes        payload size
 *   doubles[2]  files        file count
 *   doubles[3]  http_status  response status
 */

export type MetricEvent =
  | "deploy"
  | "page_view"
  | "serve"
  | "claim"
  | "redeploy"
  | "waitlist"
  | "feedback"
  | "mcp"
  | "cli";

const VIEW_TTL_SEC = 21 * 24 * 60 * 60;

export function utcDayKey(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export function recentUtcDays(n: number, now = new Date()): string[] {
  const start = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  );
  const days: string[] = [];
  for (let i = 0; i < n; i++) {
    days.push(new Date(start - i * 86_400_000).toISOString().slice(0, 10));
  }
  return days;
}

export function viewDayKey(day = utcDayKey()): string {
  return `views:day:${day}`;
}

export type SlugViews = { slug: string; today: number; d7: number };

export type ViewRollup = {
  today: number;
  d7: number;
  bySlug: SlugViews[];
};

/** Increment HTML document views for utc day. */
export async function incrementViewCount(
  kv: KVNamespace,
  slug: string,
): Promise<void> {
  const key = viewDayKey();
  // ponytail: last-write-wins RMW — concurrent HTML views same UTC day can drop increments. D1 UPSERT or a DO if counts must be exact.
  let map: Record<string, number> = {};
  try {
    const raw = await kv.get(key);
    if (raw) map = JSON.parse(raw) as Record<string, number>;
  } catch {
    map = {};
  }
  map[slug] = (Number(map[slug]) || 0) + 1;
  await kv.put(key, JSON.stringify(map), { expirationTtl: VIEW_TTL_SEC });
}

export async function loadViewRollup(
  kv: KVNamespace,
  days = 7,
): Promise<ViewRollup> {
  const dayIds = recentUtcDays(days);
  const raws = await Promise.all(dayIds.map((d) => kv.get(viewDayKey(d))));
  const maps = raws.map((raw) => {
    if (!raw) return {} as Record<string, number>;
    try {
      const j = JSON.parse(raw) as Record<string, number>;
      return j && typeof j === "object" && !Array.isArray(j) ? j : {};
    } catch {
      return {};
    }
  });
  const todayMap = maps[0] || {};
  const slugs = [...new Set(maps.flatMap((m) => Object.keys(m)))];
  const bySlug = slugs.map((slug) => ({
    slug,
    today: Number(todayMap[slug]) || 0,
    d7: maps.reduce((a, m) => a + (Number(m[slug]) || 0), 0),
  }));
  bySlug.sort((a, b) => b.d7 - a.d7 || a.slug.localeCompare(b.slug));
  return {
    today: Object.values(todayMap).reduce((a, n) => a + (Number(n) || 0), 0),
    d7: bySlug.reduce((a, r) => a + r.d7, 0),
    bySlug,
  };
}

export function viewsForSlug(rollup: ViewRollup, slug: string): SlugViews {
  return (
    rollup.bySlug.find((r) => r.slug === slug) || {
      slug,
      today: 0,
      d7: 0,
    }
  );
}

export type AftClient =
  | "mcp"
  | "web"
  | "extension"
  | "curl"
  | "cli"
  | "mac"
  | "ops-retry"
  | "other";

const KNOWN_CLIENTS = new Set<string>([
  "mcp",
  "web",
  "extension",
  "curl",
  "cli",
  "mac",
  "ops-retry",
]);

export type MetricsEnv = {
  METRICS?: AnalyticsEngineDataset;
  SITES?: KVNamespace;
};

export function resolveClient(request: Request): AftClient {
  const raw = (request.headers.get("x-aft-client") || "").toLowerCase().trim();
  if (raw === "mcp-remote") return "mcp";
  if (KNOWN_CLIENTS.has(raw)) return raw as AftClient;
  const ua = request.headers.get("user-agent") || "";
  if (/^curl\//i.test(ua)) return "curl";
  return raw ? "other" : "other";
}

/** Stable opaque id for approx unique deployers — never store raw IPs. */
export async function deployerKey(request: Request): Promise<string> {
  const ip = request.headers.get("cf-connecting-ip") || "unknown";
  const buf = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`aft.page:deployer:${ip}`),
  );
  return [...new Uint8Array(buf)]
    .slice(0, 8)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export type WriteMetricInput = {
  event: MetricEvent;
  source: AftClient | string;
  status: string;
  slug?: string;
  deployer?: string;
  path?: string;
  requestId?: string;
  ms?: number;
  bytes?: number;
  files?: number;
  httpStatus?: number;
};

/** Fire-and-forget — do not await writeDataPoint. */
export function writeMetric(env: MetricsEnv, point: WriteMetricInput): void {
  if (!env.METRICS) return;
  try {
    env.METRICS.writeDataPoint({
      indexes: [point.event],
      blobs: [
        point.source || "other",
        point.status || "",
        point.slug || "",
        point.deployer || "",
        (point.path || "").slice(0, 200),
        (point.requestId || "").slice(0, 64),
      ],
      doubles: [
        point.ms ?? 0,
        point.bytes ?? 0,
        point.files ?? 0,
        point.httpStatus ?? 0,
      ],
    });
  } catch {
    // Never fail the request because metrics failed.
  }
}

export type DeployTrackFields = {
  slug?: string;
  bytes?: number;
  files?: number;
  error?: string;
  path?: string;
  hint?: string;
  requestId?: string;
  uploadListing?: { path: string; bytes: number; type?: string }[];
};

export async function trackDeploy(
  env: MetricsEnv,
  request: Request,
  started: number,
  response: Response,
  fields?: DeployTrackFields,
): Promise<Response> {
  const ok = response.status >= 200 && response.status < 300;
  let status = fields?.error || "";
  if (!status) {
    if (ok) {
      status = "ok";
    } else {
      try {
        const clone = response.clone();
        const body = (await clone.json()) as { error?: string };
        status = body.error || String(response.status);
      } catch {
        status = String(response.status);
      }
    }
  }
  writeMetric(env, {
    event: "deploy",
    source: resolveClient(request),
    status,
    slug: fields?.slug,
    deployer: await deployerKey(request),
    path: fields?.path,
    requestId: fields?.requestId,
    ms: Math.max(0, Date.now() - started),
    bytes: fields?.bytes,
    files: fields?.files,
    httpStatus: response.status,
  });
  return response;
}

/** Edge serve outcome — all statuses. Country from cf-ipcountry; bytes when known. */
export function trackServe(
  env: MetricsEnv,
  request: Request,
  slug: string,
  opts: {
    httpStatus: number;
    path?: string;
    bytes?: number;
  },
): void {
  const country = (request.headers.get("cf-ipcountry") || "").slice(0, 8);
  writeMetric(env, {
    event: "serve",
    source: resolveClient(request),
    status: String(opts.httpStatus),
    slug,
    deployer: country,
    path: opts.path,
    requestId: request.headers.get("cf-ray") || undefined,
    bytes: opts.bytes,
    httpStatus: opts.httpStatus,
  });
}

/** Document view only: HTML 200. Also bumps the KV day counter. */
export async function trackPageView(
  env: MetricsEnv,
  request: Request,
  slug: string,
  opts: { path: string; contentType?: string; httpStatus: number },
): Promise<void> {
  if (opts.httpStatus !== 200) return;
  if (!/^text\/html\b/i.test(opts.contentType || "")) return;
  writeMetric(env, {
    event: "page_view",
    source: resolveClient(request),
    status: "ok",
    slug,
    deployer: await deployerKey(request),
    path: opts.path,
    requestId: request.headers.get("cf-ray") || undefined,
    httpStatus: 200,
  });
  if (env.SITES) {
    try {
      await incrementViewCount(env.SITES, slug);
    } catch {
      /* never fail the request because counters failed */
    }
  }
}

export function trackClaim(
  env: MetricsEnv,
  request: Request,
  slug: string,
  userId: string,
): void {
  writeMetric(env, {
    event: "claim",
    source: resolveClient(request),
    status: "ok",
    slug,
    deployer: userId.slice(0, 16),
    httpStatus: 302,
  });
}

export function trackRedeploy(
  env: MetricsEnv,
  request: Request,
  started: number,
  response: Response,
  fields?: DeployTrackFields,
): void {
  const ok = response.status >= 200 && response.status < 300;
  writeMetric(env, {
    event: "redeploy",
    source: resolveClient(request),
    status: fields?.error || (ok ? "ok" : String(response.status)),
    slug: fields?.slug,
    path: fields?.path,
    requestId: fields?.requestId,
    ms: Math.max(0, Date.now() - started),
    bytes: fields?.bytes,
    files: fields?.files,
    httpStatus: response.status,
  });
}

export function trackWaitlist(
  env: MetricsEnv,
  status: string,
  httpStatus: number,
): void {
  writeMetric(env, {
    event: "waitlist",
    source: "web",
    status,
    httpStatus,
  });
}

export function trackFeedback(
  env: MetricsEnv,
  status: string,
  httpStatus: number,
): void {
  writeMetric(env, {
    event: "feedback",
    source: "web",
    status,
    httpStatus,
  });
}

/** Opt-in anonymous CLI usage (command + version; IP hashed like deploys). */
export async function trackCliUsage(
  env: MetricsEnv,
  request: Request,
  opts: { cmd: string; version?: string },
): Promise<void> {
  writeMetric(env, {
    event: "cli",
    source: "cli",
    status: (opts.cmd || "unknown").slice(0, 64),
    slug: (opts.version || "").slice(0, 32),
    deployer: await deployerKey(request),
    requestId: request.headers.get("cf-ray") || undefined,
    httpStatus: 204,
  });
}
