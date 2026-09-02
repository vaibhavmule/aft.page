/** Same Git SHA + folder → replay last honest fail. Skip clone/plan. Bust via v in the key. */

export const RUN_FAIL_CACHE_V = "9";
export const RUN_FAIL_TTL_SEC = 14 * 24 * 3600;

const SKIP = new Set([
  "stopped",
  "runner_unavailable",
  "rate_limited",
  "slug_exhausted",
  "invalid_repo",
  "pick_root",
  "invalid_root",
  "private_repo",
  "repo_not_found",
]);

export type CachedRunFail = { error: string; reason: string };

export function runFailCacheKey(
  owner: string,
  repo: string,
  sha: string,
  root = "",
): string {
  const r = String(root || "")
    .replace(/\\/g, "/")
    .replace(/^\/+|\/+$/g, "")
    .toLowerCase();
  return `runfail:${RUN_FAIL_CACHE_V}:${owner.toLowerCase()}/${repo.toLowerCase()}:${sha.toLowerCase()}:${r}`;
}

export function shouldCacheFail(error: string | null | undefined, reason: string | null | undefined): boolean {
  const e = String(error || "").toLowerCase();
  if (SKIP.has(e)) return false;
  const reasonText = String(reason || "");
  if (/rate-limited|^stopped\.?$/i.test(reasonText)) return false;
  // Transient runner / image rollout — never poison the SHA.
  if (/clone landed|unexpected path|tunnel recovery|could not get a public url/i.test(reasonText)) {
    return false;
  }
  return Boolean(reasonText.trim());
}

export function shaFromPlanJson(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const o = JSON.parse(raw) as { sha?: unknown };
    return typeof o.sha === "string" && /^[0-9a-f]{7,40}$/i.test(o.sha) ? o.sha : null;
  } catch {
    return null;
  }
}

export function parseCachedRunFail(raw: string | null): CachedRunFail | null {
  if (!raw) return null;
  try {
    const o = JSON.parse(raw) as { error?: unknown; reason?: unknown };
    if (typeof o.reason !== "string" || !o.reason.trim()) return null;
    return {
      error: typeof o.error === "string" && o.error ? o.error : "build_failed",
      reason: o.reason,
    };
  } catch {
    return null;
  }
}

export async function readCachedRunFail(
  env: { SITES: KVNamespace },
  owner: string,
  repo: string,
  sha: string,
  root = "",
): Promise<CachedRunFail | null> {
  const raw = await env.SITES.get(runFailCacheKey(owner, repo, sha, root));
  return parseCachedRunFail(raw);
}

export async function writeCachedRunFail(
  env: { SITES: KVNamespace },
  owner: string,
  repo: string,
  sha: string,
  root: string,
  fail: CachedRunFail,
): Promise<void> {
  if (!shouldCacheFail(fail.error, fail.reason)) return;
  await env.SITES.put(
    runFailCacheKey(owner, repo, sha, root),
    JSON.stringify({ error: fail.error, reason: fail.reason }),
    { expirationTtl: RUN_FAIL_TTL_SEC },
  );
}
