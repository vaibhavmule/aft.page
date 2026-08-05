/**
 * Product metrics via Workers Analytics Engine.
 *
 * Schema (dataset: aft_page_metrics):
 *   indexes[0]  event        deploy | page_view | claim | redeploy | waitlist
 *   blobs[0]    source       mcp | web | extension | curl | cli | other
 *   blobs[1]    status       ok | error code (no_files, …) | http status text
 *   blobs[2]    slug         site slug when known
 *   blobs[3]    deployer     sha256(cf-connecting-ip)[:16] — approx unique
 *   doubles[0]  ms           deploy duration
 *   doubles[1]  bytes        payload size
 *   doubles[2]  files        file count
 *   doubles[3]  http_status  response status
 *
 * claim / redeploy are reserved for later APIs (emit 0 until then).
 */

export type MetricEvent =
  | "deploy"
  | "page_view"
  | "claim"
  | "redeploy"
  | "waitlist";

export type AftClient =
  | "mcp"
  | "web"
  | "extension"
  | "curl"
  | "cli"
  | "other";

const KNOWN_CLIENTS = new Set<string>([
  "mcp",
  "web",
  "extension",
  "curl",
  "cli",
]);

export type MetricsEnv = {
  METRICS?: AnalyticsEngineDataset;
};

export function resolveClient(request: Request): AftClient {
  const raw = (request.headers.get("x-aft-client") || "").toLowerCase().trim();
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

export async function trackDeploy(
  env: MetricsEnv,
  request: Request,
  started: number,
  response: Response,
  fields?: { slug?: string; bytes?: number; files?: number; error?: string },
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
    ms: Math.max(0, Date.now() - started),
    bytes: fields?.bytes,
    files: fields?.files,
    httpStatus: response.status,
  });
  return response;
}

export async function trackPageView(
  env: MetricsEnv,
  request: Request,
  slug: string,
  httpStatus: number,
): Promise<void> {
  if (httpStatus !== 200) return;
  writeMetric(env, {
    event: "page_view",
    source: resolveClient(request),
    status: "ok",
    slug,
    deployer: await deployerKey(request),
    httpStatus,
  });
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
  fields?: { slug?: string; bytes?: number; files?: number; error?: string },
): void {
  const ok = response.status >= 200 && response.status < 300;
  writeMetric(env, {
    event: "redeploy",
    source: resolveClient(request),
    status: fields?.error || (ok ? "ok" : String(response.status)),
    slug: fields?.slug,
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
