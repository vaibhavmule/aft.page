/**
 * Deploy recipe — the portable artifact that says how to run a thing.
 *
 * One shape for every source. An agent that just wrote the app declares it; a
 * GitHub repo has it derived once and cached; static files get the trivial
 * one. Who wrote the software is not a distinction the pipeline makes — the
 * only difference is whether the recipe arrives with the code or is worked out
 * the first time and remembered.
 *
 * Deliberately provider-neutral: `dockerfile` + port + start command runs on
 * Cloudflare Containers today and on ECS, Fly or Render unchanged. Nothing in
 * here may reference a Cloudflare primitive.
 *
 * Detection is the expensive step (heuristics, then a model call). It is paid
 * once per repo+commit+root and then replayed, so the head of the distribution
 * — the OSS tools people actually deploy — costs nothing after the first time.
 */

export const RECIPE_CACHE_V = "1";
/** Recipes are pinned to an immutable commit, so they can be kept a while. */
export const RECIPE_TTL_SEC = 90 * 24 * 3600;

export type RecipeSource =
  /** The author handed it to us — agent-written, or a repo with aft.json. */
  | "declared"
  /** Worked out from the file tree by heuristics. */
  | "detected"
  /** Worked out by a model when heuristics could not decide. */
  | "generated";

export type DeployRecipe = {
  /** Stack label for humans and metrics: express | django | rails | … */
  stack: string;
  /** Port the app listens on inside the container. */
  port: number;
  /** Command that starts the long-running process. */
  start: string;
  install?: string;
  build?: string;
  /** Subdirectory the app lives in, "" for repo root. */
  root?: string;
  /**
   * Full Dockerfile. When present it is authoritative and nothing needs to be
   * inferred at build time — this is what makes the artifact portable.
   */
  dockerfile?: string;
  /** Non-secret build/run env. Secrets never live here; they go in the vault. */
  env?: Record<string, string>;
  source: RecipeSource;
  /** Human-readable version this was derived from, e.g. "v2.1.0" or "main". */
  ref?: string;
};

const MAX_DOCKERFILE = 16_384;
const MAX_CMD = 1_024;
const MAX_ENV_KEYS = 32;

function normalizeRoot(root?: string): string {
  return String(root || "")
    .replace(/\\/g, "/")
    .replace(/^\/+|\/+$/g, "")
    .toLowerCase();
}

/**
 * Keyed on the resolved commit, not the tag. Tags move; a commit is the only
 * thing that actually pins what we detected. The tag is carried inside the
 * recipe as `ref` so a cache hit can still say "from v2.1.0".
 */
export function recipeCacheKey(
  owner: string,
  repo: string,
  sha: string,
  root = "",
): string {
  return `recipe:${RECIPE_CACHE_V}:${owner.toLowerCase()}/${repo.toLowerCase()}:${sha.toLowerCase()}:${normalizeRoot(root)}`;
}

function cleanEnv(raw: unknown): Record<string, string> | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const out: Record<string, string> = {};
  let n = 0;
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (n >= MAX_ENV_KEYS) break;
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    if (typeof value !== "string" || value.length > 4096) continue;
    out[key] = value;
    n += 1;
  }
  return n ? out : undefined;
}

/**
 * Validate an untrusted recipe — it may have come from a model, from a repo's
 * aft.json, or from an agent over MCP. A recipe that cannot be trusted is
 * better rejected than half-applied.
 */
export function parseRecipe(raw: unknown): DeployRecipe | null {
  let o: Record<string, unknown>;
  if (typeof raw === "string") {
    try {
      o = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return null;
    }
  } else if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    o = raw as Record<string, unknown>;
  } else {
    return null;
  }

  const start = typeof o.start === "string" ? o.start.trim() : "";
  if (!start || start.length > MAX_CMD) return null;

  const port = Number(o.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535) return null;

  const stack = typeof o.stack === "string" && o.stack.trim() ? o.stack.trim().slice(0, 40) : "unknown";

  const source: RecipeSource =
    o.source === "declared" || o.source === "generated" ? o.source : "detected";

  const dockerfile =
    typeof o.dockerfile === "string" && o.dockerfile.trim()
      ? o.dockerfile.slice(0, MAX_DOCKERFILE)
      : undefined;

  const str = (v: unknown, max = MAX_CMD): string | undefined =>
    typeof v === "string" && v.trim() ? v.trim().slice(0, max) : undefined;

  return {
    stack,
    port,
    start: start.slice(0, MAX_CMD),
    install: str(o.install),
    build: str(o.build),
    root: normalizeRoot(typeof o.root === "string" ? o.root : ""),
    dockerfile,
    env: cleanEnv(o.env),
    source,
    ref: str(o.ref, 120),
  };
}

/** A recipe is only worth caching if it can actually start something. */
export function shouldCacheRecipe(recipe: DeployRecipe): boolean {
  return Boolean(recipe.start && recipe.port);
}

export async function readCachedRecipe(
  env: { SITES: KVNamespace },
  owner: string,
  repo: string,
  sha: string,
  root = "",
): Promise<DeployRecipe | null> {
  const raw = await env.SITES.get(recipeCacheKey(owner, repo, sha, root));
  return parseRecipe(raw);
}

export async function writeCachedRecipe(
  env: { SITES: KVNamespace },
  owner: string,
  repo: string,
  sha: string,
  root: string,
  recipe: DeployRecipe,
): Promise<void> {
  if (!shouldCacheRecipe(recipe)) return;
  await env.SITES.put(
    recipeCacheKey(owner, repo, sha, root),
    JSON.stringify(recipe),
    { expirationTtl: RECIPE_TTL_SEC },
  );
}
