/** Run: public GitHub → detect → URL. Static sync. Vite/Next queue a job. Servers and infra fail honestly. */
import type { Env } from "./env";
import { deploy } from "./deploy";
import {
  finishRunJob,
  insertRunJob,
  type RunJobKind,
  type RunJobPhase,
  type RunJobRow,
} from "./db";
import { json, optionsResponse } from "./http";
import { rateLimit } from "./rate-limit";
import { allocateUniqueSlug, slugFromHint } from "./slug";
import { randomToken, resolveSessionUser, sha256Hex } from "./auth";
import { dispatchRunBuildWorkflow } from "./jobs";
import {
  buildPlanFromSignals,
  canonicalKind,
  type BuildPlan,
} from "./engine-kind";

export { packageHasNext } from "./engine-kind";

export type GithubRepoRef = { owner: string; repo: string };

/** Mix of static-at-root and famous source repos — v0 Run should fail most of these honestly. */
export const SAMPLE_REPOS = [
  "https://github.com/mdn/beginner-html-site",
  "https://github.com/h5bp/html5-boilerplate",
  "https://github.com/octocat/Spoon-Knife",
  "https://github.com/facebook/react",
  "https://github.com/vercel/next.js",
  "https://github.com/cloudflare/workers-sdk",
  "https://github.com/jquery/jquery",
  "https://github.com/twbs/bootstrap",
  "https://github.com/nodejs/node",
  "https://github.com/microsoft/TypeScript",
] as const;

export function parseGithubRepoUrl(input: string): GithubRepoRef | null {
  const raw = input.trim();
  if (!raw) return null;
  const stripped = raw
    .replace(/^git\+/, "")
    .replace(/\.git$/i, "")
    .replace(/\/+$/, "");
  const m = stripped.match(
    /(?:https?:\/\/)?(?:www\.)?github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)/i,
  );
  if (!m) return null;
  const owner = m[1];
  const repo = m[2];
  if (!owner || !repo) return null;
  if (owner.toLowerCase() === "orgs" || repo.toLowerCase() === "github") return null;
  return { owner, repo };
}

export function githubLooksLikeUrl(input: string): boolean {
  return /github\.com\//i.test(input) || /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(input.trim());
}

export function parseOwnerRepoShorthand(input: string): GithubRepoRef | null {
  const t = input.trim();
  const m = t.match(/^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/);
  if (!m || /github\.com/i.test(t)) return parseGithubRepoUrl(t);
  return { owner: m[1]!, repo: m[2]! };
}

export function decodeGithubContent(file: {
  encoding?: string;
  content?: string;
  type?: string;
} | null): string | null {
  if (!file || file.type === "dir" || !file.content) return null;
  const raw =
    file.encoding === "base64"
      ? atob(file.content.replace(/\n/g, ""))
      : file.content;
  return raw.trim() ? raw : null;
}

async function githubJson(
  path: string,
  token?: string,
): Promise<unknown | null> {
  const headers: Record<string, string> = {
    accept: "application/vnd.github+json",
    "user-agent": "aft.page-run",
  };
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await fetch(`https://api.github.com${path}`, {
    headers,
    signal: AbortSignal.timeout(12_000),
  });
  if (!res.ok) return null;
  return res.json();
}

async function githubRepoMeta(
  ref: GithubRepoRef,
  token?: string,
): Promise<
  | { ok: true; meta: { default_branch?: string; private?: boolean } }
  | { ok: false; error: string; reason: string }
> {
  const headers: Record<string, string> = {
    accept: "application/vnd.github+json",
    "user-agent": "aft.page-run",
  };
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await fetch(`https://api.github.com/repos/${ref.owner}/${ref.repo}`, {
    headers,
    signal: AbortSignal.timeout(12_000),
  });
  if (res.status === 403 || res.status === 429) {
    return {
      ok: false,
      error: "rate_limited",
      reason: "GitHub rate-limited. Wait a minute and try again.",
    };
  }
  if (res.status === 404) {
    return {
      ok: false,
      error: "repo_not_found",
      reason: "Repo not found or private.",
    };
  }
  if (!res.ok) {
    return {
      ok: false,
      error: "repo_not_found",
      reason: "Could not read repo from GitHub.",
    };
  }
  return { ok: true, meta: (await res.json()) as { default_branch?: string; private?: boolean } };
}

async function githubFile(
  ref: GithubRepoRef,
  path: string,
  branch: string,
  token?: string,
): Promise<string | null> {
  const file = (await githubJson(
    `/repos/${ref.owner}/${ref.repo}/contents/${path}?ref=${encodeURIComponent(branch)}`,
    token,
  )) as { encoding?: string; content?: string; type?: string } | null;
  return decodeGithubContent(file);
}

async function githubFirstFile(
  ref: GithubRepoRef,
  paths: string[],
  branch: string,
  token?: string,
): Promise<string | null> {
  for (const path of paths) {
    const got = await githubFile(ref, path, branch, token);
    if (got) return got;
  }
  return null;
}

export type RepoInspect =
  | {
      kind: "next" | "static_build" | "static" | "container";
      branch: string;
      name?: string;
      html?: string;
      plan: BuildPlan;
    }
  | { error: string; reason: string; plan?: BuildPlan };

export async function inspectGithubRepo(
  ref: GithubRepoRef,
  token?: string,
): Promise<RepoInspect> {
  const metaGot = await githubRepoMeta(ref, token);
  if (!metaGot.ok) {
    return { error: metaGot.error, reason: metaGot.reason };
  }
  const meta = metaGot.meta;
  if (meta.private) {
    return { error: "private_repo", reason: "Run is public repos only." };
  }
  const branch = meta.default_branch || "main";
  const [
    pkgRaw,
    html,
    managePy,
    req,
    nextConfig,
    viteConfig,
    cargoToml,
    gemfile,
    goMod,
    pyproject,
    goMain,
    dockerfile,
    composeYml,
    composeYaml,
    composeYmlAlt,
    composeYamlAlt,
    uvLock,
  ] = await Promise.all([
    githubFile(ref, "package.json", branch, token),
    githubFile(ref, "index.html", branch, token),
    githubFile(ref, "manage.py", branch, token),
    githubFile(ref, "requirements.txt", branch, token),
    githubFirstFile(
      ref,
      ["next.config.js", "next.config.mjs", "next.config.ts"],
      branch,
      token,
    ),
    githubFirstFile(
      ref,
      ["vite.config.js", "vite.config.ts", "vite.config.mjs"],
      branch,
      token,
    ),
    githubFile(ref, "Cargo.toml", branch, token),
    githubFile(ref, "Gemfile", branch, token),
    githubFile(ref, "go.mod", branch, token),
    githubFile(ref, "pyproject.toml", branch, token),
    githubFile(ref, "main.go", branch, token),
    githubFile(ref, "Dockerfile", branch, token),
    githubFile(ref, "docker-compose.yml", branch, token),
    githubFile(ref, "docker-compose.yaml", branch, token),
    githubFile(ref, "compose.yml", branch, token),
    githubFile(ref, "compose.yaml", branch, token),
    githubFile(ref, "uv.lock", branch, token),
  ]);

  let pkg: unknown;
  let pkgName: string | undefined;
  if (pkgRaw) {
    try {
      pkg = JSON.parse(pkgRaw) as { name?: string };
      if (pkg && typeof pkg === "object" && "name" in pkg && typeof (pkg as { name?: unknown }).name === "string") {
        pkgName = (pkg as { name: string }).name;
      }
    } catch {
      pkg = undefined;
    }
  }

  const signals = {
    pkg,
    nextConfigText: nextConfig,
    hasViteConfig: Boolean(viteConfig),
    hasManagePy: Boolean(managePy),
    requirementsTxt: req,
    pyprojectToml: pyproject,
    cargoToml,
    gemfile,
    goMod,
    goMainText: goMain,
    hasIndexHtml: Boolean(html),
    hasDockerfile: Boolean(dockerfile),
    hasCompose: Boolean(composeYml || composeYaml || composeYmlAlt || composeYamlAlt),
    hasUvLock: Boolean(uvLock),
  };
  const plan = buildPlanFromSignals(signals);
  const kind = canonicalKind(
    plan.runtime === "static_build"
      ? "static_build"
      : plan.runtime === "next"
        ? "next"
        : plan.runtime === "static"
          ? "static"
          : plan.runtime === "container"
            ? "container"
            : plan.runtime === "not_a_site"
              ? "not_a_site"
              : "unknown",
  );

  if (kind === "not_a_site") {
    return {
      error: "not_a_site",
      reason: plan.reason || `${plan.stack} is not a website.`,
      plan,
    };
  }
  if (kind === "container") {
    if (!plan.start && plan.stack !== "Docker") {
      return {
        error: "needs_container",
        reason: plan.reason || `${plan.stack} needs a start command we could not infer.`,
        plan,
      };
    }
    return { kind: "container", branch, name: pkgName, plan };
  }
  if (kind === "next") {
    return { kind: "next", branch, name: pkgName, plan };
  }
  if (kind === "static_build") {
    return { kind: "static_build", branch, name: pkgName, plan };
  }
  if (kind === "static" && html) {
    return { kind: "static", branch, html, plan };
  }
  return {
    error: "no_index",
    reason:
      "Need index.html at the repo root, Next.js, or a Node static build (npm run build). Servers, databases, and queues fail honestly.",
    plan,
  };
}

export async function fetchRepoIndexHtml(
  ref: GithubRepoRef,
): Promise<{ html: string; branch: string } | { error: string; reason: string }> {
  const got = await inspectGithubRepo(ref);
  if ("error" in got) return got;
  if (got.kind === "next") {
    return {
      error: "needs_build",
      reason: "Next.js — queue a build; do not fetch index.html.",
    };
  }
  if (got.kind === "static_build") {
    return {
      error: "needs_build",
      reason: "Static build — import to queue npm run build, do not fetch source index.html.",
    };
  }
  if (!got.html) {
    return { error: "no_index", reason: "No index.html at repo root." };
  }
  return { html: got.html, branch: got.branch };
}

function failedJob(
  id: string,
  opts: {
    owner: string;
    repo: string;
    url: string;
    trigger: string;
    error: string;
    reason: string;
    ms: number;
    httpStatus: number;
    branch?: string | null;
    kind?: RunJobKind;
  },
): RepoJobResult {
  const phase: RunJobPhase = "failed";
  return {
    id,
    createdAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    owner: opts.owner,
    repo: opts.repo,
    url: opts.url,
    trigger: opts.trigger,
    status: "failed",
    kind: opts.kind || "static",
    phase,
    error: opts.error,
    reason: opts.reason,
    slug: null,
    siteUrl: null,
    branch: opts.branch ?? null,
    ms: opts.ms,
    httpStatus: opts.httpStatus,
    logTail: null,
    userId: null,
    planJson: null,
  };
}

export type RepoJobResult = RunJobRow & { editToken?: string };

export async function executeRepoJob(
  env: Env,
  rawUrl: string,
  opts: {
    trigger: string;
    slug?: string;
    request?: Request;
    ctx?: ExecutionContext;
  },
): Promise<RepoJobResult> {
  const started = Date.now();
  const ref = parseGithubRepoUrl(rawUrl) || parseOwnerRepoShorthand(rawUrl);
  if (!ref) {
    const id = await insertRunJob(env, {
      owner: "-",
      repo: "-",
      url: rawUrl.slice(0, 300),
      trigger: opts.trigger,
    });
    await finishRunJob(env, id, {
      status: "failed",
      error: "invalid_repo",
      reason: "Not a GitHub owner/repo URL.",
      ms: Date.now() - started,
      httpStatus: 400,
    });
    return failedJob(id, {
      owner: "-",
      repo: "-",
      url: rawUrl,
      trigger: opts.trigger,
      error: "invalid_repo",
      reason: "Not a GitHub owner/repo URL.",
      ms: Date.now() - started,
      httpStatus: 400,
    });
  }

  const ghUrl = `https://github.com/${ref.owner}/${ref.repo}`;
  const token = env.AFT_RUN_GITHUB_TOKEN?.trim();
  const inspected = await inspectGithubRepo(ref, token);

  if ("error" in inspected) {
    const planJson = inspected.plan ? JSON.stringify(inspected.plan) : null;
    const id = await insertRunJob(env, {
      owner: ref.owner,
      repo: ref.repo,
      url: ghUrl,
      trigger: opts.trigger,
      planJson,
    });
    await finishRunJob(env, id, {
      status: "failed",
      error: inspected.error,
      reason: inspected.reason,
      ms: Date.now() - started,
      httpStatus: 422,
      branch: null,
    });
    return {
      ...failedJob(id, {
        owner: ref.owner,
        repo: ref.repo,
        url: ghUrl,
        trigger: opts.trigger,
        error: inspected.error,
        reason: inspected.reason,
        ms: Date.now() - started,
        httpStatus: 422,
      }),
      planJson,
    };
  }

  if (
    inspected.kind === "next" ||
    inspected.kind === "static_build" ||
    inspected.kind === "container"
  ) {
    if (opts.trigger === "ops-sample") {
      const id = await insertRunJob(env, {
        owner: ref.owner,
        repo: ref.repo,
        url: ghUrl,
        trigger: opts.trigger,
        kind: inspected.kind,
        branch: inspected.branch,
        planJson: JSON.stringify(inspected.plan),
      });
      await finishRunJob(env, id, {
        status: "failed",
        error: "needs_build",
        reason: `${inspected.kind === "next" ? "Next.js" : inspected.kind === "container" ? inspected.plan.stack : inspected.plan.stack} — import from /projects/new to queue a build. Ops sample does not spend the runner.`,
        ms: Date.now() - started,
        httpStatus: 422,
        branch: inspected.branch,
      });
      return failedJob(id, {
        owner: ref.owner,
        repo: ref.repo,
        url: ghUrl,
        trigger: opts.trigger,
        error: "needs_build",
        reason: `${inspected.kind === "next" ? "Next.js" : inspected.kind === "container" ? inspected.plan.stack : inspected.plan.stack} — import from /projects/new to queue a build. Ops sample does not spend the runner.`,
        ms: Date.now() - started,
        httpStatus: 422,
        branch: inspected.branch,
        kind: inspected.kind,
      });
    }
    return queueBuildJob(
      env,
      ref,
      {
        kind: inspected.kind,
        branch: inspected.branch,
        name: inspected.name,
        plan: inspected.plan,
      },
      {
        trigger: opts.trigger,
        slug: opts.slug,
        request: opts.request,
        started,
        ctx: opts.ctx,
      },
    );
  }

  const id = await insertRunJob(env, {
    owner: ref.owner,
    repo: ref.repo,
    url: ghUrl,
    trigger: opts.trigger,
    kind: "static",
    branch: inspected.branch,
  });

  const deployUrl = new URL(opts.request?.url || "https://api.aft.page/v1/deploy");
  deployUrl.pathname = "/v1/deploy";
  if (opts.slug) deployUrl.searchParams.set("slug", opts.slug);
  const headers = new Headers(opts.request?.headers);
  headers.set("content-type", "text/html; charset=utf-8");
  headers.set("X-Aft-Client", opts.trigger === "ops-sample" ? "ops-run" : headers.get("X-Aft-Client") || "web");
  headers.delete("content-length");
  const res = await deploy(
    new Request(deployUrl, { method: "POST", headers, body: inspected.html }),
    env,
  );
  const body = (await res.json().catch(() => ({}))) as {
    slug?: string;
    url?: string;
    error?: string;
    message?: string;
    editToken?: string;
  };
  const ms = Date.now() - started;
  if (!res.ok || !body.slug) {
    await finishRunJob(env, id, {
      status: "failed",
      error: body.error || "deploy_failed",
      reason: body.message || `Deploy ${res.status}`,
      branch: inspected.branch,
      ms,
      httpStatus: res.status,
    });
    return failedJob(id, {
      owner: ref.owner,
      repo: ref.repo,
      url: ghUrl,
      trigger: opts.trigger,
      error: body.error || "deploy_failed",
      reason: body.message || `Deploy ${res.status}`,
      ms,
      httpStatus: res.status,
      branch: inspected.branch,
    });
  }
  await finishRunJob(env, id, {
    status: "live",
    slug: body.slug,
    siteUrl: body.url || null,
    branch: inspected.branch,
    ms,
    httpStatus: 200,
  });
  return {
    id,
    createdAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    owner: ref.owner,
    repo: ref.repo,
    url: ghUrl,
    trigger: opts.trigger,
    status: "live",
    kind: "static",
    phase: "live",
    error: null,
    reason: null,
    slug: body.slug,
    siteUrl: body.url || null,
    branch: inspected.branch,
    ms,
    httpStatus: 200,
    logTail: null,
    userId: null,
    planJson: null,
    ...(body.editToken ? { editToken: body.editToken } : {}),
  };
}

async function queueBuildJob(
  env: Env,
  ref: GithubRepoRef,
  inspected: {
    kind: "next" | "static_build" | "container";
    branch: string;
    name?: string;
    plan: BuildPlan;
  },
  opts: {
    trigger: string;
    slug?: string;
    request?: Request;
    started: number;
    ctx?: ExecutionContext;
  },
): Promise<RepoJobResult> {
  const ghUrl = `https://github.com/${ref.owner}/${ref.repo}`;
  const hint = slugFromHint(inspected.name || ref.repo);
  const slug = opts.slug || (await allocateUniqueSlug(env, hint));
  const planJson = JSON.stringify(inspected.plan);
  if (!slug) {
    const id = await insertRunJob(env, {
      owner: ref.owner,
      repo: ref.repo,
      url: ghUrl,
      trigger: opts.trigger,
      kind: inspected.kind,
      branch: inspected.branch,
      planJson,
    });
    await finishRunJob(env, id, {
      status: "failed",
      error: "slug_exhausted",
      reason: "Could not allocate a slug.",
      ms: Date.now() - opts.started,
      httpStatus: 503,
    });
    return failedJob(id, {
      owner: ref.owner,
      repo: ref.repo,
      url: ghUrl,
      trigger: opts.trigger,
      error: "slug_exhausted",
      reason: "Could not allocate a slug.",
      ms: Date.now() - opts.started,
      httpStatus: 503,
      kind: inspected.kind,
    });
  }

  const jobToken = randomToken("run_tok_");
  const user = opts.request ? await resolveSessionUser(env, opts.request) : null;
  const id = await insertRunJob(env, {
    owner: ref.owner,
    repo: ref.repo,
    url: ghUrl,
    trigger: opts.trigger,
    kind: inspected.kind,
    phase: "queued",
    slug,
    branch: inspected.branch,
    jobTokenHash: await sha256Hex(jobToken),
    userId: user?.id || null,
    planJson,
  });

  const dispatchInput = {
    kind: inspected.kind,
    jobId: id,
    jobToken,
    owner: ref.owner,
    repo: ref.repo,
    slug,
    branch: inspected.branch,
    plan: inspected.plan,
  };

  const dispatched = await dispatchRunBuildWorkflow(env, dispatchInput);
  if (!dispatched.ok) {
    await finishRunJob(env, id, {
      status: "failed",
      error: "runner_unavailable",
      reason: dispatched.reason,
      slug,
      branch: inspected.branch,
      ms: Date.now() - opts.started,
      httpStatus: 503,
    });
    return {
      ...failedJob(id, {
        owner: ref.owner,
        repo: ref.repo,
        url: ghUrl,
        trigger: opts.trigger,
        error: "runner_unavailable",
        reason: dispatched.reason,
        ms: Date.now() - opts.started,
        httpStatus: 503,
        branch: inspected.branch,
        kind: inspected.kind,
      }),
      slug,
      planJson,
    };
  }

  return {
    id,
    createdAt: new Date().toISOString(),
    finishedAt: null,
    owner: ref.owner,
    repo: ref.repo,
    url: ghUrl,
    trigger: opts.trigger,
    status: "queued",
    kind: inspected.kind,
    phase: "queued",
    error: null,
    reason: null,
    slug,
    siteUrl: null,
    branch: inspected.branch,
    ms: Date.now() - opts.started,
    httpStatus: 202,
    logTail: null,
    userId: user?.id || null,
    planJson,
  };
}

export async function runSampleRepos(env: Env): Promise<RunJobRow[]> {
  const jobs: RunJobRow[] = [];
  for (let i = 0; i < SAMPLE_REPOS.length; i++) {
    const url = SAMPLE_REPOS[i]!;
    jobs.push(
      await executeRepoJob(env, url, {
        trigger: "ops-sample",
        slug: `run--s${i}`,
      }),
    );
  }
  return jobs;
}

export async function handleRepoRoute(
  request: Request,
  env: Env,
  url: URL,
  ctx?: ExecutionContext,
): Promise<Response | null> {
  const origin = request.headers.get("origin");
  if (
    url.pathname !== "/v1/repo/check" &&
    url.pathname !== "/v1/repo/deploy"
  ) {
    return null;
  }
  if (request.method === "OPTIONS") return optionsResponse(origin, true);
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const ip = request.headers.get("cf-connecting-ip") || "unknown";
  if (!(await rateLimit(env, `repo:${ip}`, 30, 3600))) {
    return json({ error: "rate_limited" }, 429);
  }

  let body: { url?: unknown } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json({ error: "invalid_json" }, 400);
  }
  const raw = typeof body.url === "string" ? body.url : "";
  const ref = parseGithubRepoUrl(raw) || parseOwnerRepoShorthand(raw);
  if (!ref) return json({ error: "invalid_repo" }, 400);

  if (url.pathname === "/v1/repo/check") {
    const got = await inspectGithubRepo(ref, env.AFT_RUN_GITHUB_TOKEN?.trim());
    if ("error" in got) {
      return json({
        ok: false,
        ...ref,
        error: got.error,
        reason: got.reason,
        ...(got.plan
          ? {
              runtime: got.plan.runtime,
              stack: got.plan.stack,
              install: got.plan.install,
              build: got.plan.build,
              outputDirs: got.plan.outputDirs,
            }
          : {}),
      });
    }
    const planFields = {
      runtime: got.plan.runtime,
      stack: got.plan.stack,
      install: got.plan.install,
      build: got.plan.build,
      start: got.plan.start,
      port: got.plan.port,
      outputDirs: got.plan.outputDirs,
    };
    if (got.kind === "next" || got.kind === "static_build" || got.kind === "container") {
      return json({ ok: true, kind: got.kind, ...ref, branch: got.branch, ...planFields });
    }
    return json({
      ok: true,
      kind: "static",
      ...ref,
      branch: got.branch,
      bytes: got.html!.length,
      ...planFields,
    });
  }

  const job = await executeRepoJob(env, raw, { trigger: "web", request, ctx });
  if (
    job.status === "queued" &&
    (job.kind === "next" ||
      job.kind === "static_build" ||
      job.kind === "vite" ||
      job.kind === "container")
  ) {
    return json(
      {
        jobId: job.id,
        status: "queued",
        kind: job.kind,
        slug: job.slug,
        owner: job.owner,
        repo: job.repo,
        branch: job.branch,
      },
      202,
    );
  }
  if (job.status !== "live") {
    return json(
      {
        error: job.error,
        reason: job.reason,
        owner: job.owner,
        repo: job.repo,
        jobId: job.id,
      },
      job.httpStatus && job.httpStatus >= 400 ? job.httpStatus : 422,
    );
  }
  return json({
    slug: job.slug,
    url: job.siteUrl,
    jobId: job.id,
    owner: job.owner,
    repo: job.repo,
    branch: job.branch,
    ...(job.editToken ? { editToken: job.editToken } : {}),
  });
}
