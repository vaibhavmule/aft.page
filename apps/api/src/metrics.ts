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
import { waitUntil } from "cloudflare:workers";

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

/** Prefix for one UTC day's per-slug counters. */
export function viewDayPrefix(day = utcDayKey()): string {
  return `views:day:${day}:`;
}

/**
 * One counter key per slug per day. The old shape was a single key holding
 * every slug's map, which KV rate-limits to one write per second *globally* —
 * one busy site silently dropped every other site's increments. Sharding by
 * slug scopes that ceiling to a single site.
 */
export function viewDayKey(slug: string, day = utcDayKey()): string {
  return `${viewDayPrefix(day)}${slug}`;
}

type ViewMeta = { n?: number };

export type SlugViews = { slug: string; today: number; d7: number };

export type ViewRollup = {
  today: number;
  d7: number;
  bySlug: SlugViews[];
};

/**
 * Increment HTML document views for this slug on the current UTC day.
 *
 * The count lives in KV metadata so `loadViewRollup` can read a whole day with
 * one `list()` instead of a `get()` per site.
 *
 * ponytail: still a last-write-wins RMW, so concurrent views of the *same*
 * slug can drop increments. Analytics Engine holds the exact record
 * (`page_view`); this is the cheap read-back for dashboards. A Durable Object
 * per slug if these ever need to be exact.
 */
export async function incrementViewCount(
  kv: KVNamespace,
  slug: string,
): Promise<void> {
  const key = viewDayKey(slug);
  let n = 0;
  try {
    const got = await kv.getWithMetadata<ViewMeta>(key, "text");
    n = Number(got.metadata?.n) || 0;
  } catch {
    n = 0;
  }
  const next = n + 1;
  await kv.put(key, String(next), {
    expirationTtl: VIEW_TTL_SEC,
    metadata: { n: next } satisfies ViewMeta,
  });
}

/** One UTC day's counters as `{ slug: n }`. Counts ride in list metadata. */
async function loadViewDay(
  kv: KVNamespace,
  day: string,
): Promise<Record<string, number>> {
  const prefix = viewDayPrefix(day);
  const out: Record<string, number> = {};
  let cursor: string | undefined;
  do {
    const listing = await kv.list<ViewMeta>({ prefix, cursor });
    for (const key of listing.keys) {
      const slug = key.name.slice(prefix.length);
      if (!slug) continue;
      out[slug] = (out[slug] || 0) + (Number(key.metadata?.n) || 0);
    }
    cursor = listing.list_complete ? undefined : listing.cursor;
  } while (cursor);
  return out;
}

export async function loadViewRollup(
  kv: KVNamespace,
  days = 7,
): Promise<ViewRollup> {
  const dayIds = recentUtcDays(days);
  const maps = await Promise.all(dayIds.map((d) => loadViewDay(kv, d)));
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

/**
 * Document view only: HTML 200. Also bumps the KV day counter.
 *
 * Fire-and-forget: telemetry must never sit between the origin read and the
 * response. The IP hash and the KV counter both cost a round trip, so this
 * runs under `waitUntil` and the caller does not await it.
 */
export function trackPageView(
  env: MetricsEnv,
  request: Request,
  slug: string,
  opts: { path: string; contentType?: string; httpStatus: number },
): void {
  if (opts.httpStatus !== 200) return;
  if (!/^text\/html\b/i.test(opts.contentType || "")) return;

  const task = (async () => {
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
    if (env.SITES) await incrementViewCount(env.SITES, slug);
  })().catch(() => {
    /* never fail the request because counters failed */
  });

  try {
    waitUntil(task);
  } catch {
    void task;
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
