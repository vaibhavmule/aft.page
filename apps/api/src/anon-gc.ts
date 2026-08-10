import type { Env } from "./env";
import { LOGIN_MAGIC_SLUG } from "./auth";
import { deleteSite, ensureDb } from "./db";
import { deleteSiteObjects } from "./storage";

export const ANON_IDLE_PAUSE_DAYS = 7;
export const ANON_IDLE_DELETE_DAYS = 30;

const PAUSE_BATCH = 50;
const DELETE_BATCH = 10;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Unowned tenant sites only. `_login` is a sentinel; `test--*` is smoke/audit. */
const ANON_SCOPE = `owner_user_id IS NULL
  AND slug != ?
  AND slug NOT LIKE 'test--%'`;

/**
 * Pause unclaimed sites idle 7d; hard-delete those idle 30d.
 * “Idle” = no successful serve and no deploy/settings change
 * (`COALESCE(last_served_at, updated_at)`). Pause does not bump `updated_at`.
 */
export async function sweepUnusedAnonSites(
  env: Env,
  nowMs = Date.now(),
): Promise<{ paused: number; deleted: number }> {
  await ensureDb(env);
  const pauseBefore = new Date(
    nowMs - ANON_IDLE_PAUSE_DAYS * DAY_MS,
  ).toISOString();
  const deleteBefore = new Date(
    nowMs - ANON_IDLE_DELETE_DAYS * DAY_MS,
  ).toISOString();

  const pause = await env.DB.prepare(
    `UPDATE sites SET active = 0
     WHERE slug IN (
       SELECT slug FROM sites
       WHERE ${ANON_SCOPE}
         AND COALESCE(active, 1) = 1
         AND COALESCE(last_served_at, updated_at) < ?
       LIMIT ?
     )`,
  )
    .bind(LOGIN_MAGIC_SLUG, pauseBefore, PAUSE_BATCH)
    .run();
  const paused = pause.meta?.changes ?? 0;

  const { results } = await env.DB.prepare(
    `SELECT slug FROM sites
     WHERE ${ANON_SCOPE}
       AND COALESCE(active, 1) = 0
       AND COALESCE(last_served_at, updated_at) < ?
     LIMIT ?`,
  )
    .bind(LOGIN_MAGIC_SLUG, deleteBefore, DELETE_BATCH)
    .all<{ slug: string }>();

  let deleted = 0;
  const deletedSlugs: string[] = [];
  for (const row of results || []) {
    try {
      await deleteSiteObjects(env, row.slug);
    } catch {
      /* keep D1 cleanup even if storage miss */
    }
    if (await deleteSite(env, row.slug)) {
      deleted += 1;
      deletedSlugs.push(row.slug);
    }
  }

  if (paused || deleted) {
    console.log(
      JSON.stringify({
        level: "info",
        event: "anon_gc",
        paused,
        deleted,
        deletedSlugs,
      }),
    );
  }

  return { paused, deleted };
}
