/** Ephemeral container origins (Quick Tunnels) die on sleep. Rebind the published URL. */
import type { Env } from "./env";
import { getLatestRunJobBySlug, getSiteRow, setSiteRuntime } from "./db";

export const CONTAINER_PUBLISH_PORT = 8080;

/**
 * A container that is gone never answers. Without a bound, the request hangs
 * until the client gives up — measured at 45s+ on a slept sandbox origin.
 * Shared by both the sandbox and legacy tunnel paths so they fail alike.
 */
export const CONTAINER_PROXY_TIMEOUT_MS = 6000;

/** Ops-only Express canary. Never on status.aft.page. */
export const EXPRESS_FIXTURE_SLUG = "nodejs-getting-started-sand";

/** Keep in sync with apps/run-container/src/origin.ts */
export function sandboxIdForJob(jobId: string): string {
  return `run-${jobId}`.replace(/[^a-z0-9-]/g, "-").slice(0, 60);
}

/**
 * Origin that addresses a container through its Durable Object instead of a
 * public hostname: `sandbox://{sandboxId}:{port}`.
 *
 * A Quick Tunnel URL was a hostname that could go stale underneath a permanent
 * aft.page URL. This cannot: the DO is the durable handle, and the container
 * behind it is allowed to come and go.
 */
export function sandboxOrigin(sandboxId: string, port = CONTAINER_PUBLISH_PORT): string {
  return `sandbox://${sandboxId}:${port}`;
}

export function isSandboxOrigin(url: string | null | undefined): boolean {
  return typeof url === "string" && url.startsWith("sandbox://");
}

export function parseSandboxOrigin(
  url: string,
): { sandboxId: string; port: number } | null {
  if (!isSandboxOrigin(url)) return null;
  const rest = url.slice("sandbox://".length);
  const at = rest.lastIndexOf(":");
  const sandboxId = at === -1 ? rest : rest.slice(0, at);
  const port = at === -1 ? CONTAINER_PUBLISH_PORT : Number.parseInt(rest.slice(at + 1), 10);
  if (!/^[a-z0-9-]{1,60}$/.test(sandboxId)) return null;
  return {
    sandboxId,
    port: Number.isFinite(port) && port > 0 ? port : CONTAINER_PUBLISH_PORT,
  };
}

/** Any origin whose backing compute is allowed to disappear. */
export function isContainerOrigin(url: string | null | undefined): boolean {
  return isSandboxOrigin(url) || isEphemeralContainerOrigin(url);
}

export function isEphemeralContainerOrigin(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    return new URL(url).hostname.toLowerCase().endsWith(".trycloudflare.com");
  } catch {
    return false;
  }
}

/** Tunnel-edge failures, not the app's own 5xx. Quick Tunnels often return 502. */
export function tunnelOriginDead(status: number): boolean {
  return status === 502 || status === 522 || status === 523 || status === 530;
}

/**
 * Serve a request by addressing the container through its Durable Object,
 * over the run-container service binding. No public hostname is involved, so
 * there is nothing to go stale between requests.
 */
export async function serveViaSandbox(
  env: Env,
  request: Request,
  upstreamUrl: string,
): Promise<Response | null> {
  if (!env.RUN_CONTAINER) return null;
  const parsed = parseSandboxOrigin(upstreamUrl);
  if (!parsed) return null;

  const headers = new Headers(request.headers);
  headers.set("x-aft-sandbox", parsed.sandboxId);
  headers.set("x-aft-port", String(parsed.port));
  // The service binding rewrites the URL, so carry the real one explicitly.
  headers.set("x-aft-original-url", request.url);

  const forwarded = new Request("https://run-container.internal/v1/serve", {
    method: request.method,
    headers,
    body:
      request.method === "GET" || request.method === "HEAD" ? undefined : request.body,
    redirect: "manual",
    // The run-container worker can itself block inside containerFetch, so the
    // bound is applied here rather than trusting it to return.
    signal: AbortSignal.timeout(CONTAINER_PROXY_TIMEOUT_MS),
    // @ts-expect-error duplex is required for streaming bodies in Workers
    duplex: "half",
  });
  return env.RUN_CONTAINER.fetch(forwarded);
}

export async function patchSiteUpstream(
  env: Env,
  slug: string,
  upstreamUrl: string,
): Promise<void> {
  const row = await getSiteRow(env, slug);
  if (row) {
    await setSiteRuntime(env, slug, {
      runtime: row.runtime,
      upstreamUrl,
      mainModule: row.mainModule,
    });
  }
  const raw = await env.SITES.get(`site:${slug}`);
  if (!raw) return;
  try {
    const meta = JSON.parse(raw) as { upstreamUrl?: string | null };
    meta.upstreamUrl = upstreamUrl;
    await env.SITES.put(`site:${slug}`, JSON.stringify(meta));
  } catch {
    /* corrupt meta — D1 row still updated */
  }
}

export async function rebindContainerOrigin(
  env: Env,
  slug: string,
): Promise<string | null> {
  if (!env.RUN_CONTAINER) return null;
  const lockKey = `rebind:${slug}`;
  const locked = await env.SITES.get(lockKey);
  if (locked) return isEphemeralContainerOrigin(locked) ? locked : null;
  const job = await getLatestRunJobBySlug(env, slug);
  if (!job || job.kind !== "container" || job.status !== "live") return null;
  await env.SITES.put(lockKey, "1", { expirationTtl: 120 });
  const res = await env.RUN_CONTAINER.fetch(
    new Request("https://run-container.internal/v1/rebind", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "user-agent": "aft.page-api",
      },
      body: JSON.stringify({
        sandbox_id: sandboxIdForJob(job.id),
        port: CONTAINER_PUBLISH_PORT,
      }),
    }),
  );
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    console.warn(
      JSON.stringify({
        level: "warn",
        where: "rebind_failed",
        slug,
        jobId: job.id,
        status: res.status,
        detail: detail.slice(0, 200),
      }),
    );
    return null;
  }
  const body = (await res.json().catch(() => ({}))) as { upstream?: unknown };
  const upstream = typeof body.upstream === "string" ? body.upstream.trim() : "";
  if (!upstream || !isEphemeralContainerOrigin(upstream)) {
    console.warn(
      JSON.stringify({
        level: "warn",
        where: "rebind_no_origin",
        slug,
        jobId: job.id,
        upstream: upstream.slice(0, 120),
      }),
    );
    return null;
  }
  await patchSiteUpstream(env, slug, upstream);
  await env.SITES.put(lockKey, upstream, { expirationTtl: 120 });
  return upstream;
}
