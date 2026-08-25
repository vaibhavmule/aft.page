/** Run jobs: GHA dispatch, progress PATCH, SSE, complete → URL. */
import type { Env } from "./env";
import { deploy } from "./deploy";
import {
  RUN_JOB_PHASES,
  finishRunJob,
  getRunJob,
  patchRunJobProgress,
  upsertSiteRow,
  type RunJobPhase,
  type RunJobRow,
} from "./db";
import { corsHeaders, json, optionsResponse } from "./http";
import { sha256Hex, timingSafeEqual } from "./auth";
import { liveSiteUrl } from "./site-url";

const SSE_MS = 24_000;
const SSE_TICK_MS = 800;

export async function dispatchRunBuildWorkflow(
  env: Env,
  input: {
    kind: "next" | "vite";
    jobId: string;
    jobToken: string;
    owner: string;
    repo: string;
    slug: string;
    branch: string;
  },
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const ghToken = env.AFT_RUN_GITHUB_TOKEN?.trim();
  const ghRepo = (env.AFT_RUN_GITHUB_REPO || "vaibhavmule/aft.page").trim();
  if (!ghToken) {
    return {
      ok: false,
      reason: `${input.kind === "vite" ? "Vite" : "Next.js"} builds need AFT_RUN_GITHUB_TOKEN (workflow dispatch).`,
    };
  }
  const workflow = input.kind === "vite" ? "run-vite.yml" : "run-next.yml";
  const res = await fetch(
    `https://api.github.com/repos/${ghRepo}/actions/workflows/${workflow}/dispatches`,
    {
      method: "POST",
      headers: {
        accept: "application/vnd.github+json",
        authorization: `Bearer ${ghToken}`,
        "user-agent": "aft.page-run",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        ref: "main",
        inputs: {
          job_id: input.jobId,
          job_token: input.jobToken,
          owner: input.owner,
          repo: input.repo,
          slug: input.slug,
          branch: input.branch,
        },
      }),
      signal: AbortSignal.timeout(12_000),
    },
  );
  if (res.status === 204 || res.ok) return { ok: true };
  const text = await res.text().catch(() => "");
  return {
    ok: false,
    reason: `GitHub Actions dispatch ${res.status}${text ? `: ${text.slice(0, 180)}` : ""}`,
  };
}

function jobPublic(job: RunJobRow): Record<string, unknown> {
  const line = lastLine(job.logTail);
  return {
    jobId: job.id,
    status: job.status,
    kind: job.kind,
    phase: job.phase,
    owner: job.owner,
    repo: job.repo,
    slug: job.slug,
    url: job.siteUrl,
    branch: job.branch,
    reason: job.reason,
    error: job.error,
    line,
    logTail: job.logTail,
    ms: job.ms,
  };
}

function lastLine(tail: string | null): string {
  if (!tail) return "";
  const parts = tail.trim().split("\n");
  return parts[parts.length - 1] || "";
}

async function authorizeJobToken(
  env: Env,
  request: Request,
  job: { jobTokenHash: string | null },
): Promise<boolean> {
  const auth = request.headers.get("authorization") || "";
  const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  if (!token || !job.jobTokenHash) return false;
  const hash = await sha256Hex(token);
  return timingSafeEqual(hash, job.jobTokenHash);
}

function jobJson(data: unknown, status: number, origin: string | null): Response {
  return json(data, status, Object.fromEntries(corsHeaders(origin, true)));
}

function sseResponse(stream: ReadableStream, origin: string | null): Response {
  return new Response(stream, {
    status: 200,
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-store",
      connection: "keep-alive",
      ...Object.fromEntries(corsHeaders(origin, true)),
    },
  });
}

async function streamJobEvents(
  env: Env,
  id: string,
): Promise<ReadableStream<Uint8Array>> {
  const enc = new TextEncoder();
  return new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) => {
        controller.enqueue(enc.encode(`data: ${JSON.stringify(obj)}\n\n`));
      };
      const deadline = Date.now() + SSE_MS;
      let last = "";
      try {
        while (Date.now() < deadline) {
          const job = await getRunJob(env, id);
          if (!job) {
            send({ error: "not_found" });
            break;
          }
          const snap = jobPublic(job);
          const packed = JSON.stringify(snap);
          if (packed !== last) {
            send(snap);
            last = packed;
          } else {
            controller.enqueue(enc.encode(": ping\n\n"));
          }
          if (job.status === "live" || job.status === "failed") break;
          await new Promise((resolve) => setTimeout(resolve, SSE_TICK_MS));
        }
      } catch (err) {
        send({ error: "stream_error", reason: err instanceof Error ? err.message : String(err) });
      } finally {
        controller.close();
      }
    },
  });
}

async function completeNextJob(
  env: Env,
  job: RunJobRow,
  upstream: string,
  logTail?: string,
): Promise<{ ok: boolean; reason?: string; url?: string; slug?: string }> {
  const slug = job.slug;
  if (!slug) return { ok: false, reason: "Job has no slug." };
  let dest: URL;
  try {
    dest = new URL(upstream);
  } catch {
    return { ok: false, reason: "upstream is not a URL." };
  }
  if (dest.protocol !== "https:") {
    return { ok: false, reason: "upstream must be https." };
  }

  const placeholder = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><title>${slug}</title></head><body><p>Next.js on aft.page</p></body></html>`;
  const aftJson = JSON.stringify({
    name: slug,
    runtime: "next",
    upstream: dest.origin,
  });
  const res = await deploy(
    new Request(`https://api.aft.page/v1/deploy?slug=${encodeURIComponent(slug)}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "X-Aft-Client": "run-next",
      },
      body: JSON.stringify({
        files: [
          { path: "index.html", content: placeholder },
          { path: "aft.json", content: aftJson },
        ],
      }),
    }),
    env,
  );
  const body = (await res.json().catch(() => ({}))) as {
    slug?: string;
    url?: string;
    deployId?: string;
    error?: string;
    message?: string;
  };
  if (!res.ok || !body.slug) {
    return {
      ok: false,
      reason: body.message || body.error || `Mapping deploy ${res.status}`,
    };
  }
  if (job.userId && body.deployId) {
    await upsertSiteRow(env, body.slug, body.deployId, job.userId);
  }
  const root = env.ROOT_DOMAIN || "aft.page";
  const siteUrl = body.url || liveSiteUrl(body.slug, root);
  await finishRunJob(env, job.id, {
    status: "live",
    slug: body.slug,
    siteUrl,
    phase: "live",
    httpStatus: 200,
    logTail,
  });
  return { ok: true, slug: body.slug, url: siteUrl };
}

type CompleteFile = { path: string; content: string; encoding?: "utf8" | "base64" };

function asCompleteFiles(raw: unknown): CompleteFile[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const out: CompleteFile[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") return null;
    const f = item as { path?: unknown; content?: unknown; encoding?: unknown };
    if (typeof f.path !== "string" || !f.path || typeof f.content !== "string") return null;
    out.push({
      path: f.path,
      content: f.content,
      encoding: f.encoding === "base64" ? "base64" : "utf8",
    });
  }
  return out;
}

async function completeFilesJob(
  env: Env,
  job: RunJobRow,
  files: CompleteFile[],
  logTail?: string,
): Promise<{ ok: boolean; reason?: string; url?: string; slug?: string }> {
  const slug = job.slug;
  if (!slug) return { ok: false, reason: "Job has no slug." };
  const res = await deploy(
    new Request(`https://api.aft.page/v1/deploy?slug=${encodeURIComponent(slug)}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "X-Aft-Client": "run-vite",
      },
      body: JSON.stringify({ files }),
    }),
    env,
  );
  const body = (await res.json().catch(() => ({}))) as {
    slug?: string;
    url?: string;
    deployId?: string;
    error?: string;
    message?: string;
    reason?: string;
  };
  if (!res.ok || !body.slug) {
    return {
      ok: false,
      reason: body.reason || body.message || body.error || `Deploy ${res.status}`,
    };
  }
  if (job.userId && body.deployId) {
    await upsertSiteRow(env, body.slug, body.deployId, job.userId);
  }
  const root = env.ROOT_DOMAIN || "aft.page";
  const siteUrl = body.url || liveSiteUrl(body.slug, root);
  await finishRunJob(env, job.id, {
    status: "live",
    slug: body.slug,
    siteUrl,
    phase: "live",
    httpStatus: 200,
    logTail,
  });
  return { ok: true, slug: body.slug, url: siteUrl };
}

export async function handleJobRoute(
  request: Request,
  env: Env,
  url: URL,
): Promise<Response | null> {
  const origin = request.headers.get("origin");
  const m = url.pathname.match(/^\/v1\/jobs\/(run_[a-z0-9]+)(\/events)?$/);
  if (!m) return null;
  const id = m[1]!;
  const events = Boolean(m[2]);

  if (request.method === "OPTIONS") return optionsResponse(origin, true);

  if (events) {
    if (request.method !== "GET") return jobJson({ error: "method_not_allowed" }, 405, origin);
    const job = await getRunJob(env, id);
    if (!job) return jobJson({ error: "not_found" }, 404, origin);
    return sseResponse(await streamJobEvents(env, id), origin);
  }

  if (request.method === "GET") {
    const job = await getRunJob(env, id);
    if (!job) return jobJson({ error: "not_found" }, 404, origin);
    return jobJson(jobPublic(job), 200, origin);
  }

  if (request.method === "PATCH") {
    const job = await getRunJob(env, id);
    if (!job) return jobJson({ error: "not_found" }, 404, origin);
    if (!(await authorizeJobToken(env, request, job))) {
      return jobJson({ error: "unauthorized" }, 401, origin);
    }
    if (job.status !== "queued") {
      return jobJson({ error: "not_running", status: job.status }, 409, origin);
    }
    let body: { phase?: unknown; line?: unknown; reason?: unknown } = {};
    try {
      body = (await request.json()) as typeof body;
    } catch {
      return jobJson({ error: "invalid_json" }, 400, origin);
    }
    const phase = typeof body.phase === "string" ? body.phase : "";
    if (!(RUN_JOB_PHASES as readonly string[]).includes(phase) || phase === "live") {
      return jobJson({ error: "invalid_phase" }, 400, origin);
    }
    if (phase === "failed") {
      const extra = typeof body.line === "string" ? body.line : "";
      if (extra) {
        await patchRunJobProgress(env, id, {
          phase: "failed",
          line: extra,
          reason: typeof body.reason === "string" ? body.reason : "Build failed.",
        });
      }
      await finishRunJob(env, id, {
        status: "failed",
        error: "build_failed",
        reason: typeof body.reason === "string" ? body.reason : "Build failed.",
        httpStatus: 422,
      });
      return jobJson({ ok: true, status: "failed" }, 200, origin);
    }
    await patchRunJobProgress(env, id, {
      phase: phase as RunJobPhase,
      line: typeof body.line === "string" ? body.line.slice(0, 2000) : null,
      reason: typeof body.reason === "string" ? body.reason : null,
    });
    return jobJson({ ok: true, phase }, 200, origin);
  }

  return jobJson({ error: "method_not_allowed" }, 405, origin);
}

export async function handleJobCompleteRoute(
  request: Request,
  env: Env,
  url: URL,
): Promise<Response | null> {
  const origin = request.headers.get("origin");
  const m = url.pathname.match(/^\/v1\/jobs\/(run_[a-z0-9]+)\/complete$/);
  if (!m) return null;
  if (request.method === "OPTIONS") return optionsResponse(origin, true);
  if (request.method !== "POST") return jobJson({ error: "method_not_allowed" }, 405, origin);
  const id = m[1]!;
  const job = await getRunJob(env, id);
  if (!job) return jobJson({ error: "not_found" }, 404, origin);
  if (!(await authorizeJobToken(env, request, job))) {
    return jobJson({ error: "unauthorized" }, 401, origin);
  }
  if (job.status !== "queued") {
    return jobJson({ error: "not_running", status: job.status }, 409, origin);
  }
  let body: { upstream?: unknown; files?: unknown; log?: unknown; reason?: unknown } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return jobJson({ error: "invalid_json" }, 400, origin);
  }
  const log = typeof body.log === "string" ? body.log.slice(-8192) : undefined;
  const files = asCompleteFiles(body.files);
  const upstream = typeof body.upstream === "string" ? body.upstream.trim() : "";

  let result: { ok: boolean; reason?: string; url?: string; slug?: string };
  if (files) {
    result = await completeFilesJob(env, job, files, log);
  } else if (upstream) {
    result = await completeNextJob(env, job, upstream, log);
  } else {
    return jobJson(
      { error: job.kind === "vite" ? "missing_files" : "missing_upstream" },
      400,
      origin,
    );
  }
  if (!result.ok) {
    await finishRunJob(env, id, {
      status: "failed",
      error: "deploy_failed",
      reason: result.reason || "Mapping deploy failed.",
      logTail: log,
      httpStatus: 422,
    });
    return jobJson({ error: "deploy_failed", reason: result.reason }, 422, origin);
  }
  return jobJson({ ok: true, slug: result.slug, url: result.url }, 200, origin);
}
