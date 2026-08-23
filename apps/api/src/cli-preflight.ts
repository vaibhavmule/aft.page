/** POST /v1/cli/preflight — advise before upload. Rules first; Workers AI if blocked. */
import type { Env } from "./env";
import { MAX_FILES, MAX_TOTAL_BYTES } from "./env";
import { explainDeployFailure } from "./fail-explain";
import { json, optionsResponse } from "./http";
import { writeMetric } from "./metrics";
import { rateLimit } from "./rate-limit";

const MODEL = "@cf/meta/llama-3.1-8b-instruct";
const MAX_BODY = 32 * 1024;
const MAX_PATHS = 40;
const MAX_DEPS = 40;
const MAX_SNIPPETS = 3;
const MAX_SNIPPET = 2048;

export type PreflightAction = "none" | "run_build" | "run_next" | "refuse";

export type PreflightSnapshot = {
  framework?: string;
  label?: string;
  runtime?: string;
  staticDeployable?: boolean;
  outDir?: string;
  buildScript?: string | null;
  needsBuild?: boolean;
  hasIndexHtml?: boolean;
  hasPackageJson?: boolean;
  fileCount?: number;
  totalBytes?: number;
  samplePaths?: string[];
  packageName?: string;
  scripts?: string[];
  deps?: string[];
  configSnippets?: { name: string; text: string }[];
  localError?: string;
  infer?: boolean;
};

export type PreflightAdvice = {
  ok: boolean;
  error?: string;
  why: string;
  fix: string;
  action: PreflightAction;
  source: "rules" | "model";
};

const ADVICE_SCHEMA = {
  type: "object",
  properties: {
    why: { type: "string" },
    fix: { type: "string" },
  },
  required: ["why", "fix"],
};

export function adviseFromSnapshot(s: PreflightSnapshot): PreflightAdvice {
  if (s.runtime === "not_a_site" || s.framework === "not-a-site") {
    return boxed("not_a_site", "refuse");
  }
  if (s.runtime === "container" || s.framework === "django") {
    return boxed("needs_container", "refuse");
  }
  if (s.runtime === "next" && s.staticDeployable === false) {
    return boxed("needs_next_build", "run_next");
  }
  if (s.runtime && s.runtime !== "static" && s.staticDeployable === false) {
    return boxed("not_static", "refuse");
  }
  if (s.needsBuild && s.buildScript) {
    return boxed("needs_build", "run_build");
  }
  if (s.fileCount != null && s.fileCount > MAX_FILES) {
    return boxed("too_many_files", "refuse", {
      files: s.fileCount,
    });
  }
  if (s.totalBytes != null && s.totalBytes > MAX_TOTAL_BYTES) {
    return boxed("payload_too_large", "refuse", {
      files: s.fileCount ?? null,
      bytes: s.totalBytes,
    });
  }
  if (s.hasIndexHtml === false) {
    const unknown =
      !s.hasPackageJson &&
      (s.framework === "unknown" || !s.framework);
    return boxed(unknown ? "unknown_project" : "no_index", "refuse");
  }
  if (s.localError) {
    return {
      ok: false,
      error: "internal",
      action: "refuse",
      source: "rules",
      ...explainDeployFailure({ error: "internal", hint: s.localError }),
    };
  }
  return {
    ok: true,
    why: "Artifact looks like a static site aft.page can host.",
    fix: "POST /v1/deploy with the built output (index.html at the root).",
    action: "none",
    source: "rules",
  };
}

function boxed(
  error: string,
  action: PreflightAction,
  extra?: { files?: number | null; bytes?: number | null },
): PreflightAdvice {
  const { why, fix } = explainDeployFailure({
    error,
    files: extra?.files,
    bytes: extra?.bytes,
  });
  return { ok: false, error, why, fix, action, source: "rules" };
}

export function sanitizeSnapshot(raw: unknown): PreflightSnapshot | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const str = (v: unknown, max: number) =>
    typeof v === "string" ? v.slice(0, max) : undefined;
  const bool = (v: unknown) => (typeof v === "boolean" ? v : undefined);
  const num = (v: unknown) =>
    typeof v === "number" && Number.isFinite(v) ? v : undefined;
  const strs = (v: unknown, max: number, each: number) => {
    if (!Array.isArray(v)) return undefined;
    return v
      .filter((x): x is string => typeof x === "string")
      .slice(0, max)
      .map((x) => x.slice(0, each));
  };
  const snippets = Array.isArray(o.configSnippets)
    ? o.configSnippets
        .slice(0, MAX_SNIPPETS)
        .flatMap((item) => {
          if (!item || typeof item !== "object") return [];
          const n = (item as { name?: unknown }).name;
          const t = (item as { text?: unknown }).text;
          if (typeof n !== "string" || typeof t !== "string") return [];
          return [{ name: n.slice(0, 64), text: t.slice(0, MAX_SNIPPET) }];
        })
    : undefined;

  return {
    framework: str(o.framework, 64),
    label: str(o.label, 80),
    runtime: str(o.runtime, 32),
    staticDeployable: bool(o.staticDeployable),
    outDir: str(o.outDir, 64),
    buildScript: str(o.buildScript, 64) ?? (o.buildScript === null ? null : undefined),
    needsBuild: bool(o.needsBuild),
    hasIndexHtml: bool(o.hasIndexHtml),
    hasPackageJson: bool(o.hasPackageJson),
    fileCount: num(o.fileCount),
    totalBytes: num(o.totalBytes),
    samplePaths: strs(o.samplePaths, MAX_PATHS, 200),
    packageName: str(o.packageName, 80),
    scripts: strs(o.scripts, 20, 40),
    deps: strs(o.deps, MAX_DEPS, 64),
    configSnippets: snippets,
    localError: str(o.localError, 200),
    infer: bool(o.infer),
  };
}

function parseModelJson(raw: unknown): { why: string; fix: string } | null {
  let text = "";
  if (typeof raw === "string") text = raw;
  else if (raw && typeof raw === "object") {
    const r = raw as { response?: unknown; why?: unknown; fix?: unknown };
    if (typeof r.why === "string" && typeof r.fix === "string") {
      return { why: r.why.slice(0, 500), fix: r.fix.slice(0, 800) };
    }
    if (typeof r.response === "string") text = r.response;
  }
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const j = JSON.parse(m[0]) as { why?: unknown; fix?: unknown };
    if (typeof j.why !== "string" || typeof j.fix !== "string") return null;
    return { why: j.why.slice(0, 500), fix: j.fix.slice(0, 800) };
  } catch {
    return null;
  }
}

export async function enrichWithModel(
  env: Env,
  snapshot: PreflightSnapshot,
  rules: PreflightAdvice,
): Promise<PreflightAdvice> {
  if (!snapshot.infer) return rules;
  if (rules.ok || rules.action === "run_build" || rules.action === "run_next") return rules;
  const parsed = await runAdviceModel(env, snapshot, rules.error);
  if (!parsed) return rules;
  return { ...rules, why: parsed.why, fix: parsed.fix, source: "model" };
}

async function runAdviceModel(
  env: Env,
  snapshot: PreflightSnapshot,
  error?: string,
): Promise<{ why: string; fix: string } | null> {
  const token = env.CF_API_TOKEN;
  const account = env.CF_ACCOUNT_ID;
  if (!token || !account) return null;
  const { infer: _infer, ...safe } = snapshot;
  try {
    const res = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${account}/ai/run/${MODEL}`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          messages: [
            {
              role: "system",
              content:
                "You advise the aft.page CLI. Detect then build: static HTML, Vite npm run build→dist, Next OpenNext, Django refuses until containers. Caps: 500 files, 25MB/file, 100MB total. Need index.html at the deploy root for static. Never upload node_modules or .next. Reply with JSON only: {why, fix}. why: one sentence. fix: concrete steps for an agent. No markdown.",
            },
            {
              role: "user",
              content: JSON.stringify({ error, snapshot: safe }),
            },
          ],
          max_tokens: 220,
          response_format: {
            type: "json_schema",
            json_schema: ADVICE_SCHEMA,
          },
        }),
      },
    );
    if (!res.ok) return null;
    const body = (await res.json()) as { result?: unknown };
    return parseModelJson(body.result ?? body);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(JSON.stringify({ level: "warn", event: "cli_preflight_ai", message }));
    return null;
  }
}

export async function handleCliPreflight(
  request: Request,
  env: Env,
): Promise<Response> {
  const origin = request.headers.get("origin");
  if (request.method === "OPTIONS") {
    return optionsResponse(origin, false);
  }
  if (request.method !== "POST") {
    return json({ error: "method_not_allowed" }, 405);
  }

  const ip = request.headers.get("cf-connecting-ip") || "unknown";
  if (!(await rateLimit(env, `cli-preflight:${ip}`, 20, 3600))) {
    return json({ error: "rate_limited" }, 429);
  }

  const len = Number(request.headers.get("content-length") || 0);
  if (len > MAX_BODY) return json({ error: "payload_too_large" }, 413);

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const snapshot = sanitizeSnapshot(raw);
  if (!snapshot) return json({ error: "invalid_json" }, 400);

  const rules = adviseFromSnapshot(snapshot);
  const advice = await enrichWithModel(env, snapshot, rules);

  writeMetric(env, {
    event: "cli",
    source: "cli",
    status: `preflight:${advice.error || "ok"}`,
    slug: snapshot.framework || "",
    httpStatus: 200,
  });

  return json(advice);
}
