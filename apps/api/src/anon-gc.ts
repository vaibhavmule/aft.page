import type { Env } from "./env";
import { LOGIN_MAGIC_SLUG } from "./auth";
import { deleteSite, ensureDb } from "./db";
import { deleteSiteObjects } from "./storage";

export const ANON_IDLE_DELETE_DAYS = 30;

const DELETE_BATCH = 10;
const UNPAUSE_BATCH = 50;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Unowned tenant sites only. `_login` is a sentinel; `test--*` is smoke/audit. */
const ANON_SCOPE = `owner_user_id IS NULL
  AND slug != ?
  AND slug NOT LIKE 'test--%'`;

/**
 * Hard-delete unclaimed sites idle 30d. Idle = no successful serve and no
 * deploy/settings change (`COALESCE(last_served_at, updated_at)`). Claimed
 * sites are never touched. Also unpauses leftover unclaimed `active=0` rows
 * from the old 7d park (does not bump `updated_at`).
 */
export async function sweepUnusedAnonSites(
  env: Env,
  nowMs = Date.now(),
): Promise<{ deleted: number; unpaused: number }> {
  await ensureDb(env);
  const deleteBefore = new Date(
    nowMs - ANON_IDLE_DELETE_DAYS * DAY_MS,
  ).toISOString();

  const { results } = await env.DB.prepare(
    `SELECT slug FROM sites
     WHERE ${ANON_SCOPE}
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

  const unpause = await env.DB.prepare(
    `UPDATE sites SET active = 1
     WHERE slug IN (
       SELECT slug FROM sites
       WHERE ${ANON_SCOPE}
         AND COALESCE(active, 1) = 0
       LIMIT ?
     )`,
  )
    .bind(LOGIN_MAGIC_SLUG, UNPAUSE_BATCH)
    .run();
  const unpaused = unpause.meta?.changes ?? 0;

  if (deleted || unpaused) {
    console.log(
      JSON.stringify({
        level: "info",
        event: "anon_gc",
        deleted,
        unpaused,
        deletedSlugs,
      }),
    );
  }

  return { deleted, unpaused };
}
