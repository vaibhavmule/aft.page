/** Ephemeral container origins (Quick Tunnels) die on sleep. Rebind the published URL. */
import type { Env } from "./env";
import { getLatestRunJobBySlug, getSiteRow, setSiteRuntime } from "./db";

export const CONTAINER_PUBLISH_PORT = 8080;

/** Ops-only Express canary. Never on status.aft.page. */
export const EXPRESS_FIXTURE_SLUG = "nodejs-getting-started-sand";

/** Keep in sync with apps/run-container/src/origin.ts */
export function sandboxIdForJob(jobId: string): string {
  return `run-${jobId}`.replace(/[^a-z0-9-]/g, "-").slice(0, 60);
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
    await res.body?.cancel().catch(() => null);
    return null;
  }
  const body = (await res.json().catch(() => ({}))) as { upstream?: unknown };
  const upstream = typeof body.upstream === "string" ? body.upstream.trim() : "";
  if (!upstream || !isEphemeralContainerOrigin(upstream)) return null;
  await patchSiteUpstream(env, slug, upstream);
  await env.SITES.put(lockKey, upstream, { expirationTtl: 120 });
  return upstream;
}
