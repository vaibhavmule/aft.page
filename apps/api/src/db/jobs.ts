import type { Env } from "../env";
import { ensureDb } from "./core";

export type RunJobStatus = "queued" | "live" | "failed";
export type RunJobKind = "static" | "next" | "vite" | "static_build" | "container";
export type RunJobPhase =
  | "queued"
  | "cloning"
  | "installing"
  | "building"
  | "deploying"
  | "live"
  | "failed";

export const RUN_JOB_PHASES = [
  "queued",
  "cloning",
  "installing",
  "building",
  "deploying",
  "live",
  "failed",
] as const;

export type RunJobRow = {
  id: string;
  createdAt: string;
  finishedAt: string | null;
  owner: string;
  repo: string;
  url: string;
  trigger: string;
  status: RunJobStatus;
  kind: RunJobKind;
  phase: RunJobPhase;
  error: string | null;
  reason: string | null;
  slug: string | null;
  siteUrl: string | null;
  branch: string | null;
  ms: number | null;
  httpStatus: number | null;
  logTail: string | null;
  userId: string | null;
  planJson: string | null;
};

type RunJobDbRow = {
  id: string;
  created_at: string;
  finished_at: string | null;
  owner: string;
  repo: string;
  url: string;
  trigger: string;
  status: string;
  kind?: string | null;
  phase?: string | null;
  error: string | null;
  reason: string | null;
  slug: string | null;
  site_url: string | null;
  branch: string | null;
  ms: number | null;
  http_status: number | null;
  log_tail?: string | null;
  job_token_hash?: string | null;
  user_id?: string | null;
  plan_json?: string | null;
};

function asPhase(raw: string | null | undefined, status: RunJobStatus): RunJobPhase {
  if (status === "live") return "live";
  if (status === "failed") return "failed";
  if (raw && (RUN_JOB_PHASES as readonly string[]).includes(raw)) {
    return raw as RunJobPhase;
  }
  return "queued";
}

function asKind(raw: string | null | undefined): RunJobKind {
  if (raw === "next" || raw === "vite" || raw === "static_build" || raw === "container") return raw;
  return "static";
}

function mapRunJob(row: RunJobDbRow): RunJobRow {
  const status: RunJobStatus =
    row.status === "live" || row.status === "queued" ? row.status : "failed";
  return {
    id: row.id,
    createdAt: row.created_at,
    finishedAt: row.finished_at,
    owner: row.owner,
    repo: row.repo,
    url: row.url,
    trigger: row.trigger,
    status,
    kind: asKind(row.kind),
    phase: asPhase(row.phase, status),
    error: row.error,
    reason: row.reason,
    slug: row.slug,
    siteUrl: row.site_url,
    branch: row.branch,
    ms: row.ms,
    httpStatus: row.http_status,
    logTail: row.log_tail ?? null,
    userId: row.user_id ?? null,
    planJson: row.plan_json ?? null,
  };
}

const RUN_JOB_SELECT = `id, created_at, finished_at, owner, repo, url, trigger, status,
            kind, phase, error, reason, slug, site_url, branch, ms, http_status,
            log_tail, job_token_hash, user_id, plan_json`;

export async function insertRunJob(
  env: Env,
  opts: {
    owner: string;
    repo: string;
    url: string;
    trigger: string;
    kind?: RunJobKind;
    phase?: RunJobPhase;
    slug?: string | null;
    branch?: string | null;
    jobTokenHash?: string | null;
    userId?: string | null;
    planJson?: string | null;
  },
): Promise<string> {
  await ensureDb(env);
  const id = `run_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
  const kind = opts.kind || "static";
  const phase = opts.phase || "queued";
  await env.DB.prepare(
    `INSERT INTO run_jobs (
       id, created_at, owner, repo, url, trigger, status, kind, phase,
       slug, branch, job_token_hash, user_id, plan_json
     ) VALUES (?, ?, ?, ?, ?, ?, 'queued', ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      new Date().toISOString(),
      opts.owner.slice(0, 80),
      opts.repo.slice(0, 80),
      opts.url.slice(0, 300),
      opts.trigger.slice(0, 32),
      kind,
      phase,
      opts.slug || null,
      opts.branch || null,
      opts.jobTokenHash || null,
      opts.userId || null,
      opts.planJson || null,
    )
    .run();
  return id;
}

export async function finishRunJob(
  env: Env,
  id: string,
  patch: {
    status: RunJobStatus;
    error?: string | null;
    reason?: string | null;
    slug?: string | null;
    siteUrl?: string | null;
    branch?: string | null;
    ms?: number;
    httpStatus?: number;
    phase?: RunJobPhase;
    logTail?: string | null;
  },
): Promise<void> {
  const phase = patch.phase || (patch.status === "live" ? "live" : patch.status === "failed" ? "failed" : "queued");
  await env.DB.prepare(
    `UPDATE run_jobs SET
       finished_at = ?, status = ?, phase = ?, error = ?, reason = ?, slug = ?, site_url = ?,
       branch = COALESCE(?, branch), ms = ?, http_status = ?, log_tail = COALESCE(?, log_tail)
     WHERE id = ?`,
  )
    .bind(
      new Date().toISOString(),
      patch.status,
      phase,
      patch.error?.slice(0, 64) || null,
      patch.reason?.slice(0, 500) || null,
      patch.slug || null,
      patch.siteUrl || null,
      patch.branch || null,
      patch.ms ?? null,
      patch.httpStatus ?? null,
      patch.logTail?.slice(-8192) ?? null,
      id,
    )
    .run();
  if (patch.status === "live" || patch.status === "failed") {
    try {
      const { notifyRunJobDone } = await import("../run-notify");
      await notifyRunJobDone(env, id);
    } catch {
      /* email is best-effort */
    }
  }
}

export async function getRunJob(
  env: Env,
  id: string,
): Promise<(RunJobRow & { jobTokenHash: string | null }) | null> {
  await ensureDb(env);
  const row = await env.DB.prepare(
    `SELECT ${RUN_JOB_SELECT} FROM run_jobs WHERE id = ?`,
  ).bind(id).first<RunJobDbRow>();
  if (!row) return null;
  return { ...mapRunJob(row), jobTokenHash: row.job_token_hash ?? null };
}

/** Newest Run job for a slug — used when KV has not caught up yet. */
export async function getLatestRunJobBySlug(
  env: Env,
  slug: string,
): Promise<RunJobRow | null> {
  await ensureDb(env);
  const row = await env.DB.prepare(
    `SELECT ${RUN_JOB_SELECT} FROM run_jobs WHERE slug = ? ORDER BY created_at DESC LIMIT 1`,
  )
    .bind(slug)
    .first<RunJobDbRow>();
  return row ? mapRunJob(row) : null;
}

export async function patchRunJobProgress(
  env: Env,
  id: string,
  patch: { phase: RunJobPhase; line?: string | null; reason?: string | null },
): Promise<void> {
  const current = await getRunJob(env, id);
  const prev = current?.logTail || "";
  const nextTail = patch.line
    ? `${prev}${prev && !prev.endsWith("\n") ? "\n" : ""}${patch.line}`.slice(-8192)
    : prev || null;
  await env.DB.prepare(
    `UPDATE run_jobs SET phase = ?, reason = COALESCE(?, reason), log_tail = ? WHERE id = ?`,
  )
    .bind(patch.phase, patch.reason?.slice(0, 500) || null, nextTail, id)
    .run();
}

export async function listRunJobs(env: Env, limit = 50): Promise<RunJobRow[]> {
  await ensureDb(env);
  const rows = await env.DB.prepare(
    `SELECT ${RUN_JOB_SELECT} FROM run_jobs ORDER BY created_at DESC LIMIT ?`,
  )
    .bind(limit)
    .all<RunJobDbRow>();
  return (rows.results || []).map(mapRunJob);
}

export async function countRunJobsByStatus(
  env: Env,
): Promise<{ live: number; failed: number; queued: number }> {
  await ensureDb(env);
  const row = await env.DB.prepare(
    `SELECT
       SUM(CASE WHEN status = 'live' THEN 1 ELSE 0 END) AS live,
       SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed,
       SUM(CASE WHEN status = 'queued' THEN 1 ELSE 0 END) AS queued
     FROM run_jobs`,
  ).first<{ live: number | null; failed: number | null; queued: number | null }>();
  return {
    live: Number(row?.live || 0),
    failed: Number(row?.failed || 0),
    queued: Number(row?.queued || 0),
  };
}
