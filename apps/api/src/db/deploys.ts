import type { Env } from "../env";
import { ensureDb } from "./core";

export type ScoreWindow = {
  successes: number;
  failures: number;
  rate: number | null;
};

export function scoreWindow(successes: number, failures: number): ScoreWindow {
  const total = successes + failures;
  return {
    successes,
    failures,
    rate: total === 0 ? null : successes / total,
  };
}

export async function insertDeploy(
  env: Env,
  opts: {
    id: string;
    slug: string;
    fileCount: number;
    bytes: number;
    createdByUserId?: string | null;
    source: "post" | "patch" | "rollback" | "absorb";
    client?: string;
    createdAt?: string;
    ms?: number | null;
  },
): Promise<void> {
  await ensureDb(env);
  await env.DB.prepare(
    `INSERT INTO deploys (id, slug, created_at, file_count, bytes, created_by_user_id, source, client, ms)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      opts.id,
      opts.slug,
      opts.createdAt ?? new Date().toISOString(),
      opts.fileCount,
      opts.bytes,
      opts.createdByUserId ?? null,
      opts.source,
      opts.client || "other",
      opts.ms ?? null,
    )
    .run();
}

export async function listDeployMsSince(
  env: Env,
  sinceIso: string,
): Promise<{ createdAt: string; ms: number }[]> {
  await ensureDb(env);
  const { results } = await env.DB.prepare(
    `SELECT created_at, ms FROM deploys WHERE ms IS NOT NULL AND created_at >= ?`,
  )
    .bind(sinceIso)
    .all<{ created_at: string; ms: number }>();
  return (results || []).map((r) => ({
    createdAt: r.created_at,
    ms: Number(r.ms),
  }));
}

export async function listDeploys(
  env: Env,
  slug: string,
  limit = 20,
): Promise<
  {
    id: string;
    createdAt: string;
    fileCount: number;
    bytes: number;
    source: string;
    client: string;
    createdByUserId: string | null;
  }[]
> {
  await ensureDb(env);
  const { results } = await env.DB.prepare(
    `SELECT id, created_at, file_count, bytes, source,
            COALESCE(client, 'other') AS client, created_by_user_id
     FROM deploys
     WHERE slug = ? ORDER BY created_at DESC LIMIT ?`,
  )
    .bind(slug, limit)
    .all<{
      id: string;
      created_at: string;
      file_count: number;
      bytes: number;
      source: string;
      client: string;
      created_by_user_id: string | null;
    }>();
  return (results || []).map((r) => ({
    id: r.id,
    createdAt: r.created_at,
    fileCount: r.file_count,
    bytes: r.bytes,
    source: r.source,
    client: r.client || "other",
    createdByUserId: r.created_by_user_id,
  }));
}

export async function countDeploysByDay(
  env: Env,
  days = 7,
): Promise<{ day: string; n: number }[]> {
  await ensureDb(env);
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const { results } = await env.DB.prepare(
    `SELECT substr(created_at, 1, 10) AS day, COUNT(*) AS n FROM deploys
     WHERE created_at >= ? GROUP BY day ORDER BY day`,
  )
    .bind(since)
    .all<{ day: string; n: number }>();
  return (results || []).map((r) => ({ day: r.day, n: Number(r.n) }));
}

export async function countDeploysSince(env: Env, sinceIso: string): Promise<number> {
  await ensureDb(env);
  const row = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM deploys WHERE created_at >= ?`,
  )
    .bind(sinceIso)
    .first<{ n: number }>();
  return Number(row?.n || 0);
}

export async function countDeploysByClient(
  env: Env,
  sinceIso: string,
): Promise<{ client: string; n: number }[]> {
  await ensureDb(env);
  const { results } = await env.DB.prepare(
    `SELECT COALESCE(client, 'other') AS client, COUNT(*) AS n FROM deploys
     WHERE created_at >= ? GROUP BY client ORDER BY n DESC`,
  )
    .bind(sinceIso)
    .all<{ client: string; n: number }>();
  return (results || []).map((r) => ({ client: r.client, n: Number(r.n) }));
}

export async function deployExists(
  env: Env,
  slug: string,
  deployId: string,
): Promise<boolean> {
  await ensureDb(env);
  const row = await env.DB.prepare(
    `SELECT id FROM deploys WHERE slug = ? AND id = ?`,
  )
    .bind(slug, deployId)
    .first<{ id: string }>();
  return Boolean(row);
}
