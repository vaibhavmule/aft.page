import type { Env } from "../env";
import { ensureDb } from "./core";

export type SiteVisibility = "public" | "private";

export async function getSiteVisibility(
  env: Env,
  slug: string,
): Promise<SiteVisibility> {
  await ensureDb(env);
  const row = await env.DB.prepare(`SELECT visibility FROM sites WHERE slug = ?`)
    .bind(slug)
    .first<{ visibility: string }>();
  return row?.visibility === "private" ? "private" : "public";
}

export async function getSiteRow(
  env: Env,
  slug: string,
): Promise<{
  slug: string;
  deployId: string;
  ownerUserId: string | null;
  visibility: SiteVisibility;
  createdAt: string;
  updatedAt: string;
  lastServedAt: string | null;
  runtime: string;
  upstreamUrl: string | null;
  mainModule: string | null;
  active: boolean;
  expiresAt: string | null;
  expired: boolean;
} | null> {
  await ensureDb(env);
  const row = await env.DB.prepare(
    `SELECT slug, deploy_id, owner_user_id, visibility, created_at, updated_at, last_served_at,
            COALESCE(runtime, 'static') AS runtime, upstream_url, main_module,
            COALESCE(active, 1) AS active, expires_at, COALESCE(expired, 0) AS expired
     FROM sites WHERE slug = ?`,
  )
    .bind(slug)
    .first<{
      slug: string;
      deploy_id: string;
      owner_user_id: string | null;
      visibility: string;
      created_at: string;
      updated_at: string;
      last_served_at: string | null;
      runtime: string;
      upstream_url: string | null;
      main_module: string | null;
      active: number;
      expires_at: string | null;
      expired: number;
    }>();
  if (!row) return null;
  return {
    slug: row.slug,
    deployId: row.deploy_id,
    ownerUserId: row.owner_user_id ?? null,
    visibility: row.visibility === "private" ? "private" : "public",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastServedAt: row.last_served_at ?? null,
    runtime: row.runtime || "static",
    upstreamUrl: row.upstream_url ?? null,
    mainModule: row.main_module ?? null,
    active: Number(row.active) !== 0,
    expiresAt: row.expires_at ?? null,
    expired: Number(row.expired) !== 0,
  };
}

/** Soft-expire: keep the D1 row for audit, stop serving, free the slug. */
export async function markSiteExpired(
  env: Env,
  slug: string,
  nowIso = new Date().toISOString(),
): Promise<boolean> {
  await ensureDb(env);
  const result = await env.DB.prepare(
    `UPDATE sites SET expired = 1, expires_at = COALESCE(expires_at, ?), updated_at = ? WHERE slug = ?`,
  )
    .bind(nowIso, nowIso, slug)
    .run();
  return (result.meta?.changes ?? 0) > 0;
}

/** Record an anon quick-view expiry (expires_at column). */
export async function setSiteExpiresAt(
  env: Env,
  slug: string,
  expiresAtIso: string | null,
): Promise<void> {
  await ensureDb(env);
  const now = new Date().toISOString();
  await env.DB.prepare(
    `UPDATE sites SET expires_at = ?, updated_at = ? WHERE slug = ?`,
  )
    .bind(expiresAtIso, now, slug)
    .run();
}

export async function setSiteVisibility(
  env: Env,
  slug: string,
  visibility: SiteVisibility,
): Promise<boolean> {
  await ensureDb(env);
  const result = await env.DB.prepare(
    `UPDATE sites SET visibility = ?, updated_at = ? WHERE slug = ?`,
  )
    .bind(visibility, new Date().toISOString(), slug)
    .run();
  return (result.meta?.changes ?? 0) > 0;
}

/** Toggle a site's serve switch. Inactive sites keep files but stop serving. */
export async function setSiteActive(
  env: Env,
  slug: string,
  active: boolean,
): Promise<boolean> {
  await ensureDb(env);
  const result = await env.DB.prepare(
    `UPDATE sites SET active = ?, updated_at = ? WHERE slug = ?`,
  )
    .bind(active ? 1 : 0, new Date().toISOString(), slug)
    .run();
  return (result.meta?.changes ?? 0) > 0;
}

/**
 * Permanently delete a site and every D1 row that references it. FK cascade is
 * not relied upon (D1 does not enforce `PRAGMA foreign_keys` per connection),
 * so children are deleted explicitly in one atomic batch. Storage objects
 * (R2/KV) are cleaned separately via `deleteSiteObjects`.
 *
 * Cross-cutting note: this function (and `renameSiteSlug` below) has implicit
 * schema knowledge of nearly every domain's tables — connectors, secrets,
 * capabilities, deploys, invites, members, custom domains, etc. That's kept
 * as raw SQL here (not calls into other db/*.ts files) so the whole operation
 * stays one atomic `env.DB.batch()`. Do not decompose it per-domain.
 */
export async function deleteSite(env: Env, slug: string): Promise<boolean> {
  await ensureDb(env);
  const p = (sql: string) => env.DB.prepare(sql).bind(slug);
  const results = await env.DB.batch([
    p(`DELETE FROM connector_invokes WHERE slug = ?`),
    p(`DELETE FROM connectors WHERE slug = ?`),
    p(`DELETE FROM site_secret_values WHERE slug = ?`),
    p(`DELETE FROM site_crons WHERE slug = ?`),
    p(`DELETE FROM site_capability_grants WHERE slug = ?`),
    p(`DELETE FROM deploys WHERE slug = ?`),
    p(`DELETE FROM site_invites WHERE slug = ?`),
    p(`DELETE FROM site_members WHERE slug = ?`),
    p(`DELETE FROM magic_links WHERE slug = ?`),
    p(`DELETE FROM site_secrets WHERE slug = ?`),
    p(`DELETE FROM custom_domains WHERE slug = ?`),
    p(`DELETE FROM sites WHERE slug = ?`),
  ]);
  const siteDelete = results[results.length - 1];
  return (siteDelete?.meta?.changes ?? 0) > 0;
}

/**
 * Rename a site's primary key across D1. Caller must ensure `toSlug` is free
 * and move R2/KV objects separately. Returns false if `fromSlug` is missing.
 *
 * See the cross-cutting note on `deleteSite` above — same reasoning applies.
 */
export async function renameSiteSlug(
  env: Env,
  fromSlug: string,
  toSlug: string,
): Promise<boolean> {
  await ensureDb(env);
  if (fromSlug === toSlug) return true;

  const row = await env.DB.prepare(`SELECT slug FROM sites WHERE slug = ?`)
    .bind(fromSlug)
    .first<{ slug: string }>();
  if (!row) return false;

  const taken = await env.DB.prepare(`SELECT slug FROM sites WHERE slug = ?`)
    .bind(toSlug)
    .first<{ slug: string }>();
  if (taken) {
    throw new Error("slug_taken");
  }

  const now = new Date().toISOString();
  // Copy sites row → update children → delete old. PK-slug tables need
  // INSERT+DELETE; others UPDATE. D1 may not enforce FKs per connection.
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO sites (
         slug, deploy_id, owner_user_id, visibility, created_at, updated_at,
         last_served_at, runtime, upstream_url, main_module, active
       )
       SELECT ?, deploy_id, owner_user_id, visibility, created_at, ?,
              last_served_at, COALESCE(runtime, 'static'), upstream_url, main_module,
              COALESCE(active, 1)
       FROM sites WHERE slug = ?`,
    ).bind(toSlug, now, fromSlug),

    env.DB.prepare(
      `INSERT INTO site_secrets (slug, edit_token_hash, created_at)
       SELECT ?, edit_token_hash, created_at FROM site_secrets WHERE slug = ?`,
    ).bind(toSlug, fromSlug),
    env.DB.prepare(`DELETE FROM site_secrets WHERE slug = ?`).bind(fromSlug),

    env.DB.prepare(
      `INSERT INTO site_capability_grants (
         slug, requested_json, approved_json, status, deploy_id,
         approved_at, approved_by, updated_at
       )
       SELECT ?, requested_json, approved_json, status, deploy_id,
              approved_at, approved_by, updated_at
       FROM site_capability_grants WHERE slug = ?`,
    ).bind(toSlug, fromSlug),
    env.DB.prepare(`DELETE FROM site_capability_grants WHERE slug = ?`).bind(
      fromSlug,
    ),

    env.DB.prepare(
      `INSERT INTO site_secret_values (slug, name, ciphertext, updated_at)
       SELECT ?, name, ciphertext, updated_at FROM site_secret_values WHERE slug = ?`,
    ).bind(toSlug, fromSlug),
    env.DB.prepare(`DELETE FROM site_secret_values WHERE slug = ?`).bind(
      fromSlug,
    ),

    env.DB.prepare(
      `INSERT INTO site_members (slug, user_id, email, role, created_at)
       SELECT ?, user_id, email, role, created_at FROM site_members WHERE slug = ?`,
    ).bind(toSlug, fromSlug),
    env.DB.prepare(`DELETE FROM site_members WHERE slug = ?`).bind(fromSlug),

    env.DB.prepare(`UPDATE deploys SET slug = ? WHERE slug = ?`).bind(
      toSlug,
      fromSlug,
    ),
    env.DB.prepare(`UPDATE site_invites SET slug = ? WHERE slug = ?`).bind(
      toSlug,
      fromSlug,
    ),
    env.DB.prepare(`UPDATE magic_links SET slug = ? WHERE slug = ?`).bind(
      toSlug,
      fromSlug,
    ),
    env.DB.prepare(`UPDATE custom_domains SET slug = ? WHERE slug = ?`).bind(
      toSlug,
      fromSlug,
    ),
    env.DB.prepare(`UPDATE connectors SET slug = ? WHERE slug = ?`).bind(
      toSlug,
      fromSlug,
    ),
    env.DB.prepare(`UPDATE connector_invokes SET slug = ? WHERE slug = ?`).bind(
      toSlug,
      fromSlug,
    ),
    env.DB.prepare(`UPDATE site_crons SET slug = ? WHERE slug = ?`).bind(
      toSlug,
      fromSlug,
    ),
    env.DB.prepare(`UPDATE site_logs SET slug = ? WHERE slug = ?`).bind(
      toSlug,
      fromSlug,
    ),
    env.DB.prepare(`UPDATE deploy_failures SET slug = ? WHERE slug = ?`).bind(
      toSlug,
      fromSlug,
    ),

    env.DB.prepare(`DELETE FROM sites WHERE slug = ?`).bind(fromSlug),
  ]);

  return true;
}

export async function upsertSiteRow(
  env: Env,
  slug: string,
  deployId: string,
  ownerUserId?: string | null,
): Promise<void> {
  await ensureDb(env);
  const now = new Date().toISOString();
  // Assign owner only when currently null; never steal an existing owner.
  await env.DB.prepare(
    `INSERT INTO sites (slug, deploy_id, owner_user_id, visibility, created_at, updated_at)
     VALUES (?, ?, ?, 'public', ?, ?)
     ON CONFLICT(slug) DO UPDATE SET
       deploy_id = excluded.deploy_id,
       updated_at = excluded.updated_at,
       owner_user_id = COALESCE(sites.owner_user_id, excluded.owner_user_id),
       active = CASE WHEN sites.owner_user_id IS NULL THEN 1 ELSE sites.active END`,
  )
    .bind(slug, deployId, ownerUserId ?? null, now, now)
    .run();
}

export async function setSiteRuntime(
  env: Env,
  slug: string,
  opts: {
    runtime: string;
    upstreamUrl?: string | null;
    mainModule?: string | null;
  },
): Promise<void> {
  await ensureDb(env);
  const now = new Date().toISOString();
  await env.DB.prepare(
    `UPDATE sites
     SET runtime = ?,
         upstream_url = ?,
         main_module = ?,
         updated_at = ?
     WHERE slug = ?`,
  )
    .bind(
      opts.runtime,
      opts.upstreamUrl ?? null,
      opts.mainModule ?? null,
      now,
      slug,
    )
    .run();
}

export async function getSiteOwnerId(
  env: Env,
  slug: string,
): Promise<string | null> {
  await ensureDb(env);
  const row = await env.DB.prepare(
    `SELECT owner_user_id FROM sites WHERE slug = ?`,
  )
    .bind(slug)
    .first<{ owner_user_id: string | null }>();
  return row?.owner_user_id ?? null;
}

export async function getSiteOwnerEmail(
  env: Env,
  slug: string,
): Promise<string | null> {
  await ensureDb(env);
  const row = await env.DB.prepare(
    `SELECT u.email AS email
     FROM sites s JOIN users u ON u.id = s.owner_user_id
     WHERE s.slug = ?`,
  )
    .bind(slug)
    .first<{ email: string }>();
  return row?.email ?? null;
}

export async function touchLastServed(
  env: Env,
  slug: string,
): Promise<void> {
  await ensureDb(env);
  try {
    await env.DB.prepare(
      `UPDATE sites SET last_served_at = ? WHERE slug = ?`,
    )
      .bind(new Date().toISOString(), slug)
      .run();
  } catch {
    /* ignore if column missing briefly */
  }
}

export async function countSitesByOwner(
  env: Env,
  ownerUserId: string,
): Promise<number> {
  await ensureDb(env);
  const row = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM sites WHERE owner_user_id = ?`,
  )
    .bind(ownerUserId)
    .first<{ n: number }>();
  return Number(row?.n ?? 0);
}

export async function listSitesByOwner(
  env: Env,
  ownerUserId: string,
  opts?: { limit?: number; offset?: number },
): Promise<
  {
    slug: string;
    deployId: string;
    visibility: string;
    updatedAt: string;
    lastServedAt: string | null;
    runtime: string;
    active: boolean;
  }[]
> {
  await ensureDb(env);
  const limit = Math.min(Math.max(opts?.limit ?? 1000, 1), 100);
  const offset = Math.max(opts?.offset ?? 0, 0);
  const { results } = await env.DB.prepare(
    `SELECT slug, deploy_id, visibility, updated_at, last_served_at,
            COALESCE(runtime, 'static') AS runtime,
            COALESCE(active, 1) AS active
     FROM sites WHERE owner_user_id = ?
     ORDER BY updated_at DESC
     LIMIT ? OFFSET ?`,
  )
    .bind(ownerUserId, limit, offset)
    .all<{
      slug: string;
      deploy_id: string;
      visibility: string;
      updated_at: string;
      last_served_at: string | null;
      runtime: string;
      active: number;
    }>();
  return (results || []).map((r) => ({
    slug: r.slug,
    deployId: r.deploy_id,
    visibility: r.visibility,
    updatedAt: r.updated_at,
    lastServedAt: r.last_served_at ?? null,
    runtime: r.runtime || "static",
    active: Number(r.active) !== 0,
  }));
}

/** Sites the user is a member of (not owner). Cap is fine until org-scale membership. */
export async function listSitesByMember(
  env: Env,
  userId: string,
  opts?: { limit?: number },
): Promise<
  {
    slug: string;
    deployId: string;
    visibility: string;
    updatedAt: string;
    lastServedAt: string | null;
    runtime: string;
    active: boolean;
    role: "view" | "edit";
    ownerEmail: string | null;
  }[]
> {
  await ensureDb(env);
  const limit = Math.min(Math.max(opts?.limit ?? 100, 1), 100);
  const { results } = await env.DB.prepare(
    `SELECT s.slug, s.deploy_id, s.visibility, s.updated_at, s.last_served_at,
            COALESCE(s.runtime, 'static') AS runtime,
            COALESCE(s.active, 1) AS active,
            m.role,
            u.email AS owner_email
     FROM site_members m
     JOIN sites s ON s.slug = m.slug
     LEFT JOIN users u ON u.id = s.owner_user_id
     WHERE m.user_id = ?
       AND (s.owner_user_id IS NULL OR s.owner_user_id != ?)
     ORDER BY s.updated_at DESC
     LIMIT ?`,
  )
    .bind(userId, userId, limit)
    .all<{
      slug: string;
      deploy_id: string;
      visibility: string;
      updated_at: string;
      last_served_at: string | null;
      runtime: string;
      active: number;
      role: string;
      owner_email: string | null;
    }>();
  return (results || [])
    .filter((r) => r.role === "edit" || r.role === "view")
    .map((r) => ({
      slug: r.slug,
      deployId: r.deploy_id,
      visibility: r.visibility,
      updatedAt: r.updated_at,
      lastServedAt: r.last_served_at ?? null,
      runtime: r.runtime || "static",
      active: Number(r.active) !== 0,
      role: r.role as "view" | "edit",
      ownerEmail: r.owner_email ?? null,
    }));
}
