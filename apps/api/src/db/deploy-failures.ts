import type { Env } from "../env";
import { deleteFailurePayload } from "../storage";
import { ensureDb } from "./core";

export type UploadListingFile = {
  path: string;
  bytes: number;
  type?: string;
};

export type UploadListing = {
  contentType?: string;
  userAgent?: string;
  files: UploadListingFile[];
};

export type DeployFailureRow = {
  id: string;
  createdAt: string;
  error: string;
  path: string | null;
  slug: string | null;
  source: string;
  files: number | null;
  bytes: number | null;
  httpStatus: number;
  requestId: string;
  hint: string | null;
  upload: UploadListing | null;
  hasPayload: boolean;
};

function parseUploadListing(raw: string | null | undefined): UploadListing | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as UploadListing;
    if (!v || !Array.isArray(v.files)) return null;
    return {
      contentType: typeof v.contentType === "string" ? v.contentType : undefined,
      userAgent: typeof v.userAgent === "string" ? v.userAgent : undefined,
      files: v.files
        .filter((f) => f && typeof f.path === "string")
        .map((f) => ({
          path: String(f.path).slice(0, 256),
          bytes: Number(f.bytes) || 0,
          type: typeof f.type === "string" ? f.type : undefined,
        })),
    };
  } catch {
    return null;
  }
}

function serializeUploadListing(upload?: UploadListing | null): string | null {
  if (!upload?.files?.length && !upload?.contentType && !upload?.userAgent) {
    return null;
  }
  return JSON.stringify({
    contentType: upload.contentType?.slice(0, 120) || undefined,
    userAgent: upload.userAgent?.slice(0, 200) || undefined,
    files: upload.files.slice(0, 200).map((f) => ({
      path: f.path.slice(0, 256),
      bytes: f.bytes,
      type: f.type?.slice(0, 80),
    })),
  });
}

const FAILURE_RETENTION_DAYS = 14;

export async function insertDeployFailure(
  env: Env,
  opts: {
    error: string;
    path?: string;
    slug?: string;
    source: string;
    files?: number;
    bytes?: number;
    httpStatus: number;
    requestId: string;
    hint?: string;
    upload?: UploadListing | null;
  },
): Promise<string> {
  await ensureDb(env);
  const id = `fail_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
  await env.DB.prepare(
    `INSERT INTO deploy_failures (
       id, created_at, error, path, slug, source, files, bytes, http_status, request_id, hint, upload_json, has_payload
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
  )
    .bind(
      id,
      new Date().toISOString(),
      opts.error.slice(0, 64),
      opts.path?.slice(0, 512) || null,
      opts.slug || null,
      opts.source || "other",
      opts.files ?? null,
      opts.bytes ?? null,
      opts.httpStatus,
      opts.requestId.slice(0, 64),
      opts.hint?.slice(0, 500) || null,
      serializeUploadListing(opts.upload),
    )
    .run();
  return id;
}

export async function setFailureHasPayload(env: Env, id: string): Promise<void> {
  await env.DB.prepare(`UPDATE deploy_failures SET has_payload = 1 WHERE id = ?`)
    .bind(id)
    .run();
}

export async function getDeployFailure(
  env: Env,
  id: string,
): Promise<DeployFailureRow | null> {
  if (!id || !/^fail_[a-z0-9]+$/i.test(id)) return null;
  await ensureDb(env);
  const r = await env.DB.prepare(
    `SELECT id, created_at, error, path, slug, source, files, bytes, http_status, request_id, hint, upload_json,
            COALESCE(has_payload, 0) AS has_payload
     FROM deploy_failures WHERE id = ?`,
  )
    .bind(id)
    .first<{
      id: string;
      created_at: string;
      error: string;
      path: string | null;
      slug: string | null;
      source: string;
      files: number | null;
      bytes: number | null;
      http_status: number;
      request_id: string;
      hint: string | null;
      upload_json: string | null;
      has_payload: number;
    }>();
  if (!r) return null;
  return mapFailureRow(r);
}

export async function listDeployFailures(
  env: Env,
  limit = 50,
): Promise<DeployFailureRow[]> {
  await ensureDb(env);
  const { results } = await env.DB.prepare(
    `SELECT id, created_at, error, path, slug, source, files, bytes, http_status, request_id, hint, upload_json,
            COALESCE(has_payload, 0) AS has_payload
     FROM deploy_failures ORDER BY created_at DESC LIMIT ?`,
  )
    .bind(limit)
    .all<{
      id: string;
      created_at: string;
      error: string;
      path: string | null;
      slug: string | null;
      source: string;
      files: number | null;
      bytes: number | null;
      http_status: number;
      request_id: string;
      hint: string | null;
      upload_json: string | null;
      has_payload: number;
    }>();
  return (results || []).map(mapFailureRow);
}

function mapFailureRow(r: {
  id: string;
  created_at: string;
  error: string;
  path: string | null;
  slug: string | null;
  source: string;
  files: number | null;
  bytes: number | null;
  http_status: number;
  request_id: string;
  hint: string | null;
  upload_json: string | null;
  has_payload: number;
}): DeployFailureRow {
  return {
    id: r.id,
    createdAt: r.created_at,
    error: r.error,
    path: r.path,
    slug: r.slug,
    source: r.source,
    files: r.files,
    bytes: r.bytes,
    httpStatus: r.http_status,
    requestId: r.request_id,
    hint: r.hint,
    upload: parseUploadListing(r.upload_json),
    hasPayload: Number(r.has_payload) === 1,
  };
}

export async function countFailuresByError(
  env: Env,
  days = 7,
): Promise<{ error: string; n: number }[]> {
  await ensureDb(env);
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const { results } = await env.DB.prepare(
    `SELECT error, COUNT(*) AS n FROM deploy_failures
     WHERE created_at >= ? GROUP BY error ORDER BY n DESC`,
  )
    .bind(since)
    .all<{ error: string; n: number }>();
  return (results || []).map((r) => ({ error: r.error, n: Number(r.n) }));
}

export async function pruneDeployFailures(env: Env): Promise<void> {
  await ensureDb(env);
  const cutoff = new Date(
    Date.now() - FAILURE_RETENTION_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();
  // Page over expired ids instead of hydrating the whole table into the Worker.
  const PRUNE_BATCH = 100;
  let pruned = 0;
  for (;;) {
    const { results } = await env.DB.prepare(
      `SELECT id FROM deploy_failures WHERE created_at < ? LIMIT ?`,
    )
      .bind(cutoff, PRUNE_BATCH)
      .all<{ id: string }>();
    const ids = results || [];
    if (ids.length === 0) break;
    for (const row of ids) {
      try {
        await deleteFailurePayload(env, row.id);
      } catch {
        /* keep pruning rows even if R2 delete fails */
      }
    }
    pruned += ids.length;
    if (ids.length < PRUNE_BATCH) break;
  }
  if (pruned > 0) {
    await env.DB.prepare(`DELETE FROM deploy_failures WHERE created_at < ?`)
      .bind(cutoff)
      .run();
  }
}

export async function countFailuresSince(env: Env, sinceIso: string): Promise<number> {
  await ensureDb(env);
  const row = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM deploy_failures WHERE created_at >= ?`,
  )
    .bind(sinceIso)
    .first<{ n: number }>();
  return Number(row?.n || 0);
}

export async function countFailuresBySource(
  env: Env,
  sinceIso: string,
): Promise<{ source: string; n: number }[]> {
  await ensureDb(env);
  const { results } = await env.DB.prepare(
    `SELECT source, COUNT(*) AS n FROM deploy_failures
     WHERE created_at >= ? GROUP BY source ORDER BY n DESC`,
  )
    .bind(sinceIso)
    .all<{ source: string; n: number }>();
  return (results || []).map((r) => ({ source: r.source, n: Number(r.n) }));
}

export async function countFailuresByDay(
  env: Env,
  days = 7,
): Promise<{ day: string; n: number }[]> {
  await ensureDb(env);
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const { results } = await env.DB.prepare(
    `SELECT substr(created_at, 1, 10) AS day, COUNT(*) AS n FROM deploy_failures
     WHERE created_at >= ? GROUP BY day ORDER BY day`,
  )
    .bind(since)
    .all<{ day: string; n: number }>();
  return (results || []).map((r) => ({ day: r.day, n: Number(r.n) }));
}

export async function listDeployFailuresForSlug(
  env: Env,
  slug: string,
  limit = 20,
): Promise<
  { id: string; createdAt: string; error: string; path: string | null; source: string }[]
> {
  await ensureDb(env);
  const { results } = await env.DB.prepare(
    `SELECT id, created_at, error, path, source FROM deploy_failures
     WHERE slug = ? ORDER BY created_at DESC LIMIT ?`,
  )
    .bind(slug, limit)
    .all<{
      id: string;
      created_at: string;
      error: string;
      path: string | null;
      source: string;
    }>();
  return (results || []).map((r) => ({
    id: r.id,
    createdAt: r.created_at,
    error: r.error,
    path: r.path,
    source: r.source,
  }));
}
