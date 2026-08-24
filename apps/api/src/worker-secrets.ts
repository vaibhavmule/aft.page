/**
 * Sync aft env vault → site Worker (next/worker runtime).
 * Script name from upstream *.workers.dev hostname, else aft-u-{slug}.
 */
import type { Env } from "./env";
import { getSiteRow } from "./db";
import {
  deleteSiteSecret,
  getSiteSecretsMap,
  listSiteSecretNames,
  putSiteSecret,
} from "./secrets";

export function workerScriptName(
  slug: string,
  upstreamUrl: string | null | undefined,
): string {
  if (upstreamUrl) {
    try {
      const host = new URL(upstreamUrl).hostname.toLowerCase();
      const m = host.match(/^([a-z0-9-]+)\.([a-z0-9-]+\.)?workers\.dev$/);
      if (m?.[1]) return m[1];
    } catch {
      /* fall through */
    }
  }
  return `aft-u-${slug}`;
}

function cfAccountId(env: Env): string | null {
  return env.CF_ACCOUNT_ID?.trim() || null;
}

function cfApiToken(env: Env): string | null {
  return env.CF_API_TOKEN?.trim() || null;
}

export function needsWorkerSecretSync(
  runtime: string,
  upstreamUrl: string | null | undefined,
): boolean {
  return (
    (runtime === "next" || runtime === "worker") &&
    Boolean(upstreamUrl?.trim())
  );
}

async function cfWorkerSecretPut(
  env: Env,
  scriptName: string,
  name: string,
  value: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const accountId = cfAccountId(env);
  const token = cfApiToken(env);
  if (!accountId || !token) {
    return {
      ok: false,
      reason: "CF_ACCOUNT_ID + CF_API_TOKEN required to sync secrets to the site Worker.",
    };
  }
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts/${encodeURIComponent(scriptName)}/secrets`,
    {
      method: "PUT",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ name, text: value, type: "secret_text" }),
      signal: AbortSignal.timeout(15_000),
    },
  );
  const body = (await res.json().catch(() => ({}))) as {
    success?: boolean;
    errors?: { message?: string }[];
  };
  if (res.ok && body.success !== false) return { ok: true };
  const msg =
    body.errors?.[0]?.message ||
    `Cloudflare secret PUT ${res.status}`;
  return { ok: false, reason: msg };
}

async function cfWorkerSecretDelete(
  env: Env,
  scriptName: string,
  name: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const accountId = cfAccountId(env);
  const token = cfApiToken(env);
  if (!accountId || !token) {
    return {
      ok: false,
      reason: "CF_ACCOUNT_ID + CF_API_TOKEN required to sync secrets to the site Worker.",
    };
  }
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts/${encodeURIComponent(scriptName)}/secrets/${encodeURIComponent(name)}`,
    {
      method: "DELETE",
      headers: { authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(15_000),
    },
  );
  if (res.ok) return { ok: true };
  const body = (await res.json().catch(() => ({}))) as {
    errors?: { message?: string }[];
  };
  return {
    ok: false,
    reason: body.errors?.[0]?.message || `Cloudflare secret DELETE ${res.status}`,
  };
}

/** Push one vault secret to the site Worker when runtime + upstream are ready. */
export async function syncSiteSecretToWorker(
  env: Env,
  slug: string,
  name: string,
  value: string,
): Promise<{ synced: boolean; reason?: string }> {
  const row = await getSiteRow(env, slug);
  if (!row || !needsWorkerSecretSync(row.runtime, row.upstreamUrl)) {
    return { synced: false, reason: "worker_not_ready" };
  }
  const script = workerScriptName(slug, row.upstreamUrl);
  const got = await cfWorkerSecretPut(env, script, name, value);
  if (!got.ok) return { synced: false, reason: got.reason };
  return { synced: true };
}

export async function unsyncSiteSecretFromWorker(
  env: Env,
  slug: string,
  name: string,
): Promise<{ synced: boolean; reason?: string }> {
  const row = await getSiteRow(env, slug);
  if (!row || !needsWorkerSecretSync(row.runtime, row.upstreamUrl)) {
    return { synced: false, reason: "worker_not_ready" };
  }
  const script = workerScriptName(slug, row.upstreamUrl);
  const got = await cfWorkerSecretDelete(env, script, name);
  if (!got.ok) return { synced: false, reason: got.reason };
  return { synced: true };
}

/** After next/worker upstream is registered, push any vault secrets waiting on the Worker. */
export async function syncAllVaultSecretsToWorker(
  env: Env,
  slug: string,
): Promise<{ synced: number; skipped: boolean; reason?: string }> {
  const row = await getSiteRow(env, slug);
  if (!row || !needsWorkerSecretSync(row.runtime, row.upstreamUrl)) {
    return { synced: 0, skipped: true, reason: "worker_not_ready" };
  }
  const map = await getSiteSecretsMap(env, slug);
  const names = Object.keys(map);
  if (names.length === 0) return { synced: 0, skipped: false };

  const script = workerScriptName(slug, row.upstreamUrl);
  let synced = 0;
  for (const name of names) {
    const got = await cfWorkerSecretPut(env, script, name, map[name]!);
    if (got.ok) synced += 1;
  }
  return { synced, skipped: false };
}

export function scheduleVaultSyncToWorker(
  env: Env,
  slug: string,
  runtime: string,
  upstreamUrl: string | null | undefined,
): void {
  if (!needsWorkerSecretSync(runtime, upstreamUrl)) return;
  void syncAllVaultSecretsToWorker(env, slug).catch((err) => {
    console.error(
      JSON.stringify({
        level: "error",
        where: "worker_secrets_sync",
        slug,
        message: err instanceof Error ? err.message : String(err),
      }),
    );
  });
}
