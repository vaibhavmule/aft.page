import type { Env } from "./env";
import { deleteFailurePayload } from "./storage";

/**
 * Schema comes from `migrations/` via wrangler D1 (deploy + vitest pool).
 * Kept as a no-op so call sites stay stable — never reintroduce per-request DDL
 * (cold isolates were paying multi-second CREATE TABLE tax).
 */
export async function ensureDb(_env: Env): Promise<void> {
  /* no-op */
}

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
} | null> {
  await ensureDb(env);
  const row = await env.DB.prepare(
    `SELECT slug, deploy_id, owner_user_id, visibility, created_at, updated_at, last_served_at,
            COALESCE(runtime, 'static') AS runtime, upstream_url, main_module,
            COALESCE(active, 1) AS active
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
  };
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

export async function getSiteMemberRole(
  env: Env,
  slug: string,
  userId: string,
): Promise<"view" | "edit" | null> {
  await ensureDb(env);
  const row = await env.DB.prepare(
    `SELECT role FROM site_members WHERE slug = ? AND user_id = ?`,
  )
    .bind(slug, userId)
    .first<{ role: string }>();
  if (row?.role === "edit" || row?.role === "view") return row.role;
  return null;
}

export async function listSiteMembers(
  env: Env,
  slug: string,
): Promise<{ email: string; role: string; userId: string }[]> {
  await ensureDb(env);
  const { results } = await env.DB.prepare(
    `SELECT user_id, email, role FROM site_members WHERE slug = ? ORDER BY created_at ASC`,
  )
    .bind(slug)
    .all<{ user_id: string; email: string; role: string }>();
  return (results || []).map((r) => ({
    userId: r.user_id,
    email: r.email,
    role: r.role,
  }));
}

export async function listSiteInvites(
  env: Env,
  slug: string,
): Promise<{ id: string; email: string; role: string; expiresAt: string }[]> {
  await ensureDb(env);
  const { results } = await env.DB.prepare(
    `SELECT id, email, role, expires_at FROM site_invites
     WHERE slug = ? AND accepted_at IS NULL
     ORDER BY created_at ASC`,
  )
    .bind(slug)
    .all<{ id: string; email: string; role: string; expires_at: string }>();
  return (results || []).map((r) => ({
    id: r.id,
    email: r.email,
    role: r.role,
    expiresAt: r.expires_at,
  }));
}

export async function findPendingInviteByEmail(
  env: Env,
  slug: string,
  email: string,
): Promise<{ id: string; email: string; role: string } | null> {
  await ensureDb(env);
  const row = await env.DB.prepare(
    `SELECT id, email, role FROM site_invites
     WHERE slug = ? AND email = ? AND accepted_at IS NULL
     ORDER BY created_at DESC LIMIT 1`,
  )
    .bind(slug, email)
    .first<{ id: string; email: string; role: string }>();
  return row ?? null;
}

export async function findMemberByEmail(
  env: Env,
  slug: string,
  email: string,
): Promise<{ userId: string; email: string; role: string } | null> {
  await ensureDb(env);
  const row = await env.DB.prepare(
    `SELECT user_id, email, role FROM site_members
     WHERE slug = ? AND email = ? LIMIT 1`,
  )
    .bind(slug, email)
    .first<{ user_id: string; email: string; role: string }>();
  if (!row) return null;
  return { userId: row.user_id, email: row.email, role: row.role };
}

export async function findUserByEmail(
  env: Env,
  email: string,
): Promise<{ id: string; email: string } | null> {
  await ensureDb(env);
  const row = await env.DB.prepare(`SELECT id, email FROM users WHERE email = ?`)
    .bind(email)
    .first<{ id: string; email: string }>();
  return row ?? null;
}

export async function upsertSiteMember(
  env: Env,
  slug: string,
  userId: string,
  email: string,
  role: "view" | "edit",
): Promise<void> {
  await ensureDb(env);
  const now = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO site_members (slug, user_id, email, role, created_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(slug, user_id) DO UPDATE SET role = excluded.role, email = excluded.email`,
  )
    .bind(slug, userId, email, role, now)
    .run();
}

export async function removeSiteMember(
  env: Env,
  slug: string,
  userId: string,
): Promise<boolean> {
  await ensureDb(env);
  const result = await env.DB.prepare(
    `DELETE FROM site_members WHERE slug = ? AND user_id = ?`,
  )
    .bind(slug, userId)
    .run();
  return (result.meta?.changes ?? 0) > 0;
}

/**
 * Permanently delete a site and every D1 row that references it. FK cascade is
 * not relied upon (D1 does not enforce `PRAGMA foreign_keys` per connection),
 * so children are deleted explicitly in one atomic batch. Storage objects
 * (R2/KV) are cleaned separately via `deleteSiteObjects`.
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

export async function createSiteInvite(
  env: Env,
  opts: {
    id: string;
    slug: string;
    email: string;
    role: "view" | "edit";
    tokenHash: string;
    invitedBy: string;
    expiresAt: string;
  },
): Promise<void> {
  await ensureDb(env);
  const now = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO site_invites
      (id, slug, email, role, token_hash, invited_by, expires_at, accepted_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?)`,
  )
    .bind(
      opts.id,
      opts.slug,
      opts.email,
      opts.role,
      opts.tokenHash,
      opts.invitedBy,
      opts.expiresAt,
      now,
    )
    .run();
}

export type SiteInviteRow = {
  id: string;
  slug: string;
  email: string;
  role: string;
  token_hash: string;
  invited_by: string;
  expires_at: string;
  accepted_at: string | null;
};

export async function findSiteInviteByTokenHash(
  env: Env,
  tokenHash: string,
): Promise<SiteInviteRow | null> {
  await ensureDb(env);
  return (
    (await env.DB.prepare(
      `SELECT id, slug, email, role, token_hash, invited_by, expires_at, accepted_at
       FROM site_invites WHERE token_hash = ?`,
    )
      .bind(tokenHash)
      .first<SiteInviteRow>()) ?? null
  );
}

export async function acceptSiteInvite(
  env: Env,
  inviteId: string,
): Promise<void> {
  await ensureDb(env);
  await env.DB.prepare(
    `UPDATE site_invites SET accepted_at = ? WHERE id = ?`,
  )
    .bind(new Date().toISOString(), inviteId)
    .run();
}

export async function deleteSiteInvite(
  env: Env,
  slug: string,
  inviteId: string,
): Promise<boolean> {
  await ensureDb(env);
  const result = await env.DB.prepare(
    `DELETE FROM site_invites WHERE id = ? AND slug = ?`,
  )
    .bind(inviteId, slug)
    .run();
  return (result.meta?.changes ?? 0) > 0;
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

export async function setSiteEditTokenHash(
  env: Env,
  slug: string,
  editTokenHash: string,
): Promise<void> {
  await ensureDb(env);
  const now = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO site_secrets (slug, edit_token_hash, created_at)
     VALUES (?, ?, ?)
     ON CONFLICT(slug) DO UPDATE SET edit_token_hash = excluded.edit_token_hash, created_at = excluded.created_at`,
  )
    .bind(slug, editTokenHash, now)
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

export async function clearSiteEditTokenHash(env: Env, slug: string): Promise<void> {
  await ensureDb(env);
  await env.DB.prepare(`DELETE FROM site_secrets WHERE slug = ?`).bind(slug).run();
}

export async function getEditTokenHash(
  env: Env,
  slug: string,
): Promise<string | null> {
  await ensureDb(env);
  const row = await env.DB.prepare(
    `SELECT edit_token_hash FROM site_secrets WHERE slug = ?`,
  )
    .bind(slug)
    .first<{ edit_token_hash: string }>();
  return row?.edit_token_hash ?? null;
}

export async function addWaitlistSignup(
  env: Env,
  email: string,
): Promise<boolean> {
  await ensureDb(env);
  const result = await env.DB.prepare(
    `INSERT OR IGNORE INTO waitlist_signups (id, email, source, created_at)
     VALUES (?, ?, 'marketing', ?)`,
  )
    .bind(crypto.randomUUID(), email, new Date().toISOString())
    .run();
  return (result.meta?.changes ?? 0) > 0;
}

export async function addFeedback(
  env: Env,
  input: { message: string; email: string | null; page: string | null },
): Promise<void> {
  await ensureDb(env);
  await env.DB.prepare(
    `INSERT INTO feedback (id, message, email, page, source, created_at)
     VALUES (?, ?, ?, ?, 'marketing', ?)`,
  )
    .bind(
      crypto.randomUUID(),
      input.message,
      input.email,
      input.page,
      new Date().toISOString(),
    )
    .run();
}

export type FeedbackRow = {
  id: string;
  message: string;
  email: string | null;
  page: string | null;
  source: string;
  createdAt: string;
};

export type OpsSnapshot = {
  sites: number;
  claimed: number;
  users: number;
  waitlist: number;
  waitlist7d: number;
  deploys: number;
  deploysMtd: number;
  deployBytes: number;
  feedback: number;
  active24h: number;
  domains: number;
  domainRequests: number;
  /** runtime worker/next with upstream — each is an aft-owned Worker (WfP trigger). */
  siteWorkers: number;
};

export async function countOpsSnapshot(
  env: Env,
  since7d: string,
  mtd: string,
  since24h: string,
): Promise<OpsSnapshot> {
  await ensureDb(env);
  const n = async (q: string, bind?: string) => {
    const stmt = bind
      ? env.DB.prepare(q).bind(bind)
      : env.DB.prepare(q);
    const row = await stmt.first<{ n: number }>();
    return Number(row?.n ?? 0);
  };
  const [
    sites,
    claimed,
    users,
    waitlist,
    waitlist7d,
    deploys,
    deploysMtd,
    deployBytes,
    feedback,
    active24h,
    domains,
    domainRequests,
    siteWorkers,
  ] = await Promise.all([
    n(`SELECT COUNT(*) AS n FROM sites WHERE slug NOT LIKE 'test--%'`),
    n(
      `SELECT COUNT(*) AS n FROM sites WHERE owner_user_id IS NOT NULL AND slug NOT LIKE 'test--%'`,
    ),
    n(`SELECT COUNT(*) AS n FROM users`),
    n(`SELECT COUNT(*) AS n FROM waitlist_signups`),
    n(`SELECT COUNT(*) AS n FROM waitlist_signups WHERE created_at >= ?`, since7d),
    n(`SELECT COUNT(*) AS n FROM deploys`),
    n(`SELECT COUNT(*) AS n FROM deploys WHERE created_at >= ?`, mtd),
    n(`SELECT COALESCE(SUM(bytes), 0) AS n FROM deploys`),
    n(`SELECT COUNT(*) AS n FROM feedback`),
    n(
      `SELECT COUNT(*) AS n FROM sites WHERE last_served_at >= ? AND slug NOT LIKE 'test--%'`,
      since24h,
    ),
    n(`SELECT COUNT(*) AS n FROM custom_domains`),
    n(`SELECT COUNT(*) AS n FROM users WHERE custom_domains = 'requested'`),
    n(
      `SELECT COUNT(*) AS n FROM sites WHERE slug NOT LIKE 'test--%'
        AND COALESCE(runtime, 'static') IN ('worker', 'next')
        AND upstream_url IS NOT NULL AND TRIM(upstream_url) != ''`,
    ),
  ]);
  return {
    sites,
    claimed,
    users,
    waitlist,
    waitlist7d,
    deploys,
    deploysMtd,
    deployBytes,
    feedback,
    active24h,
    domains,
    domainRequests,
    siteWorkers,
  };
}

export async function listFeedback(
  env: Env,
  limit = 50,
): Promise<FeedbackRow[]> {
  await ensureDb(env);
  const { results } = await env.DB.prepare(
    `SELECT id, message, email, page, source, created_at
     FROM feedback ORDER BY created_at DESC LIMIT ?`,
  )
    .bind(limit)
    .all<{
      id: string;
      message: string;
      email: string | null;
      page: string | null;
      source: string;
      created_at: string;
    }>();
  return (results || []).map((r) => ({
    id: r.id,
    message: r.message,
    email: r.email,
    page: r.page,
    source: r.source,
    createdAt: r.created_at,
  }));
}

export type ConnectorRow = {
  id: string;
  slug: string;
  token_hash: string;
  label: string | null;
  last_seen_at: string | null;
  created_at: string;
};

export type ConnectorInvokeRow = {
  id: string;
  slug: string;
  capability: string;
  payload_json: string;
  status: string;
  result_json: string | null;
  error: string | null;
  created_at: string;
  completed_at: string | null;
};

export async function insertConnector(
  env: Env,
  opts: {
    id: string;
    slug: string;
    tokenHash: string;
    label?: string | null;
  },
): Promise<void> {
  await ensureDb(env);
  await env.DB.prepare(
    `INSERT INTO connectors (id, slug, token_hash, label, last_seen_at, created_at)
     VALUES (?, ?, ?, ?, NULL, ?)`,
  )
    .bind(
      opts.id,
      opts.slug,
      opts.tokenHash,
      opts.label ?? null,
      new Date().toISOString(),
    )
    .run();
}

export async function findConnectorByTokenHash(
  env: Env,
  tokenHash: string,
): Promise<ConnectorRow | null> {
  await ensureDb(env);
  const row = await env.DB.prepare(
    `SELECT id, slug, token_hash, label, last_seen_at, created_at
     FROM connectors WHERE token_hash = ?`,
  )
    .bind(tokenHash)
    .first<ConnectorRow>();
  return row ?? null;
}

export async function touchConnectorSeen(
  env: Env,
  connectorId: string,
): Promise<void> {
  await ensureDb(env);
  await env.DB.prepare(
    `UPDATE connectors SET last_seen_at = ? WHERE id = ?`,
  )
    .bind(new Date().toISOString(), connectorId)
    .run();
}

export async function getLatestConnectorForSlug(
  env: Env,
  slug: string,
): Promise<ConnectorRow | null> {
  await ensureDb(env);
  const row = await env.DB.prepare(
    `SELECT id, slug, token_hash, label, last_seen_at, created_at
     FROM connectors WHERE slug = ?
     ORDER BY created_at DESC LIMIT 1`,
  )
    .bind(slug)
    .first<ConnectorRow>();
  return row ?? null;
}

export async function createConnectorInvoke(
  env: Env,
  opts: {
    id: string;
    slug: string;
    capability: string;
    payload: unknown;
  },
): Promise<void> {
  await ensureDb(env);
  await env.DB.prepare(
    `INSERT INTO connector_invokes
      (id, slug, capability, payload_json, status, result_json, error, created_at, completed_at)
     VALUES (?, ?, ?, ?, 'pending', NULL, NULL, ?, NULL)`,
  )
    .bind(
      opts.id,
      opts.slug,
      opts.capability,
      JSON.stringify(opts.payload ?? {}),
      new Date().toISOString(),
    )
    .run();
}

export async function claimNextPendingInvoke(
  env: Env,
  slug: string,
): Promise<ConnectorInvokeRow | null> {
  await ensureDb(env);
  const row = await env.DB.prepare(
    `SELECT id, slug, capability, payload_json, status, result_json, error, created_at, completed_at
     FROM connector_invokes
     WHERE slug = ? AND status = 'pending'
     ORDER BY created_at ASC LIMIT 1`,
  )
    .bind(slug)
    .first<ConnectorInvokeRow>();
  if (!row) return null;
  // Mark in-flight so another poller does not double-claim (v0: single connector).
  await env.DB.prepare(
    `UPDATE connector_invokes SET status = 'running' WHERE id = ? AND status = 'pending'`,
  )
    .bind(row.id)
    .run();
  const claimed = await env.DB.prepare(
    `SELECT id, slug, capability, payload_json, status, result_json, error, created_at, completed_at
     FROM connector_invokes WHERE id = ?`,
  )
    .bind(row.id)
    .first<ConnectorInvokeRow>();
  return claimed?.status === "running" ? claimed : null;
}

export async function completeConnectorInvoke(
  env: Env,
  opts: {
    id: string;
    slug: string;
    ok: boolean;
    result?: unknown;
    error?: string;
  },
): Promise<boolean> {
  await ensureDb(env);
  const existing = await getConnectorInvoke(env, opts.id);
  if (!existing || existing.slug !== opts.slug) return false;
  if (existing.status !== "running" && existing.status !== "pending") {
    return false;
  }
  const now = new Date().toISOString();
  await env.DB.prepare(
    `UPDATE connector_invokes
     SET status = ?, result_json = ?, error = ?, completed_at = ?
     WHERE id = ?`,
  )
    .bind(
      opts.ok ? "done" : "error",
      opts.ok ? JSON.stringify(opts.result ?? null) : null,
      opts.ok ? null : (opts.error ?? "error"),
      now,
      opts.id,
    )
    .run();
  return true;
}

export async function getConnectorInvoke(
  env: Env,
  id: string,
): Promise<ConnectorInvokeRow | null> {
  await ensureDb(env);
  const row = await env.DB.prepare(
    `SELECT id, slug, capability, payload_json, status, result_json, error, created_at, completed_at
     FROM connector_invokes WHERE id = ?`,
  )
    .bind(id)
    .first<ConnectorInvokeRow>();
  return row ?? null;
}

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

export async function pruneDeployFailures(env: Env): Promise<void> {
  await ensureDb(env);
  const cutoff = new Date(
    Date.now() - FAILURE_RETENTION_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();
  const { results } = await env.DB.prepare(
    `SELECT id FROM deploy_failures WHERE created_at < ?`,
  )
    .bind(cutoff)
    .all<{ id: string }>();
  for (const row of results || []) {
    try {
      await deleteFailurePayload(env, row.id);
    } catch {
      /* keep pruning rows even if R2 delete fails */
    }
  }
  await env.DB.prepare(`DELETE FROM deploy_failures WHERE created_at < ?`)
    .bind(cutoff)
    .run();
}

export type ScoreWindow = {
  successes: number;
  failures: number;
  rate: number | null;
};

export async function countDeploysSince(env: Env, sinceIso: string): Promise<number> {
  await ensureDb(env);
  const row = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM deploys WHERE created_at >= ?`,
  )
    .bind(sinceIso)
    .first<{ n: number }>();
  return Number(row?.n || 0);
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

export type OpsSiteListRow = {
  slug: string;
  deployId: string;
  ownerEmail: string | null;
  visibility: string;
  runtime: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  lastServedAt: string | null;
  upstreamUrl: string | null;
  mainModule: string | null;
  deployCount: number;
  deployBytes: number;
  failureCount: number;
};

export async function listAllSites(
  env: Env,
  limit = 200,
): Promise<OpsSiteListRow[]> {
  await ensureDb(env);
  const { results } = await env.DB.prepare(
    `SELECT s.slug, s.deploy_id, u.email AS owner_email, s.visibility,
            COALESCE(s.runtime, 'static') AS runtime, COALESCE(s.active, 1) AS active,
            s.created_at, s.updated_at, s.last_served_at, s.upstream_url, s.main_module,
            COALESCE(d.n, 0) AS deploy_count, COALESCE(d.bytes, 0) AS deploy_bytes,
            COALESCE(f.n, 0) AS failure_count
     FROM sites s
     LEFT JOIN users u ON u.id = s.owner_user_id
     LEFT JOIN (
       SELECT slug, COUNT(*) AS n, SUM(bytes) AS bytes FROM deploys GROUP BY slug
     ) d ON d.slug = s.slug
     LEFT JOIN (
       SELECT slug, COUNT(*) AS n FROM deploy_failures WHERE slug IS NOT NULL GROUP BY slug
     ) f ON f.slug = s.slug
     WHERE s.slug NOT LIKE 'test--%'
     ORDER BY s.updated_at DESC
     LIMIT ?`,
  )
    .bind(limit)
    .all<{
      slug: string;
      deploy_id: string;
      owner_email: string | null;
      visibility: string;
      runtime: string;
      active: number;
      created_at: string;
      updated_at: string;
      last_served_at: string | null;
      upstream_url: string | null;
      main_module: string | null;
      deploy_count: number;
      deploy_bytes: number;
      failure_count: number;
    }>();
  return (results || []).map((r) => ({
    slug: r.slug,
    deployId: r.deploy_id,
    ownerEmail: r.owner_email,
    visibility: r.visibility,
    runtime: r.runtime || "static",
    active: Number(r.active) !== 0,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    lastServedAt: r.last_served_at,
    upstreamUrl: r.upstream_url,
    mainModule: r.main_module,
    deployCount: Number(r.deploy_count),
    deployBytes: Number(r.deploy_bytes),
    failureCount: Number(r.failure_count),
  }));
}

export type OpsUserRow = {
  id: string;
  email: string;
  createdAt: string;
  customDomains: string | null;
  sites: number;
};

export async function listOpsUsers(env: Env, limit = 200): Promise<OpsUserRow[]> {
  await ensureDb(env);
  const { results } = await env.DB.prepare(
    `SELECT u.id, u.email, u.created_at, u.custom_domains,
            COALESCE(s.n, 0) AS sites
     FROM users u
     LEFT JOIN (
       SELECT owner_user_id, COUNT(*) AS n FROM sites
       WHERE owner_user_id IS NOT NULL AND slug NOT LIKE 'test--%'
       GROUP BY owner_user_id
     ) s ON s.owner_user_id = u.id
     ORDER BY CASE u.custom_domains
       WHEN 'requested' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END,
       u.created_at DESC
     LIMIT ?`,
  )
    .bind(limit)
    .all<{
      id: string;
      email: string;
      created_at: string;
      custom_domains: string | null;
      sites: number;
    }>();
  return (results || []).map((r) => ({
    id: r.id,
    email: r.email,
    createdAt: r.created_at,
    customDomains: r.custom_domains,
    sites: Number(r.sites),
  }));
}

export type OpsDomainRow = {
  hostname: string;
  slug: string;
  status: string;
  sslStatus: string | null;
  error: string | null;
  createdAt: string;
  ownerEmail: string | null;
};

export async function listOpsCustomDomains(
  env: Env,
  limit = 200,
): Promise<OpsDomainRow[]> {
  await ensureDb(env);
  const { results } = await env.DB.prepare(
    `SELECT d.hostname, d.slug, d.status, d.ssl_status, d.error, d.created_at,
            u.email AS owner_email
     FROM custom_domains d
     LEFT JOIN sites s ON s.slug = d.slug
     LEFT JOIN users u ON u.id = s.owner_user_id
     ORDER BY d.created_at DESC
     LIMIT ?`,
  )
    .bind(limit)
    .all<{
      hostname: string;
      slug: string;
      status: string;
      ssl_status: string | null;
      error: string | null;
      created_at: string;
      owner_email: string | null;
    }>();
  return (results || []).map((r) => ({
    hostname: r.hostname,
    slug: r.slug,
    status: r.status,
    sslStatus: r.ssl_status,
    error: r.error,
    createdAt: r.created_at,
    ownerEmail: r.owner_email,
  }));
}

export async function listConnectorsForOps(
  env: Env,
  slug: string,
): Promise<
  { id: string; label: string | null; lastSeenAt: string | null; createdAt: string }[]
> {
  await ensureDb(env);
  const { results } = await env.DB.prepare(
    `SELECT id, label, last_seen_at, created_at FROM connectors
     WHERE slug = ? ORDER BY created_at DESC`,
  )
    .bind(slug)
    .all<{
      id: string;
      label: string | null;
      last_seen_at: string | null;
      created_at: string;
    }>();
  return (results || []).map((r) => ({
    id: r.id,
    label: r.label,
    lastSeenAt: r.last_seen_at,
    createdAt: r.created_at,
  }));
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

export type CapabilityDoc = {
  secrets: string[];
  egress: string[];
  data: string[];
};

export async function upsertCapabilityRequest(
  env: Env,
  slug: string,
  deployId: string,
  requested: CapabilityDoc,
): Promise<{ status: string; approved: CapabilityDoc | null }> {
  await ensureDb(env);
  const now = new Date().toISOString();
  const requestedJson = JSON.stringify(requested);
  const existing = await getCapabilityGrant(env, slug);

  let status = "pending";
  if (
    existing?.approved &&
    existing.status === "approved" &&
    capabilitiesCovered(existing.approved, requested)
  ) {
    status = "approved";
  }

  await env.DB.prepare(
    `INSERT INTO site_capability_grants
      (slug, requested_json, approved_json, status, deploy_id, approved_at, approved_by, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(slug) DO UPDATE SET
       requested_json = excluded.requested_json,
       deploy_id = excluded.deploy_id,
       updated_at = excluded.updated_at,
       status = excluded.status,
       approved_json = COALESCE(site_capability_grants.approved_json, excluded.approved_json)`,
  )
    .bind(
      slug,
      requestedJson,
      existing?.approved ? JSON.stringify(existing.approved) : null,
      status,
      deployId,
      status === "approved" ? now : null,
      null,
      now,
    )
    .run();

  return {
    status,
    approved: existing?.approved ?? null,
  };
}

export function capabilitiesCovered(
  approved: CapabilityDoc,
  requested: CapabilityDoc,
): boolean {
  const hasAll = (need: string[], have: string[]) =>
    need.every((n) => have.includes(n));
  return (
    hasAll(requested.secrets, approved.secrets) &&
    hasAll(requested.egress, approved.egress) &&
    hasAll(requested.data, approved.data)
  );
}

export async function getCapabilityGrant(
  env: Env,
  slug: string,
): Promise<{
  requested: CapabilityDoc;
  approved: CapabilityDoc | null;
  status: string;
  deployId: string | null;
} | null> {
  await ensureDb(env);
  const row = await env.DB.prepare(
    `SELECT requested_json, approved_json, status, deploy_id
     FROM site_capability_grants WHERE slug = ?`,
  )
    .bind(slug)
    .first<{
      requested_json: string;
      approved_json: string | null;
      status: string;
      deploy_id: string | null;
    }>();
  if (!row) return null;
  let requested: CapabilityDoc = { secrets: [], egress: [], data: [] };
  let approved: CapabilityDoc | null = null;
  try {
    requested = normalizeCapabilities(JSON.parse(row.requested_json));
  } catch {
    /* keep empty */
  }
  if (row.approved_json) {
    try {
      approved = normalizeCapabilities(JSON.parse(row.approved_json));
    } catch {
      approved = null;
    }
  }
  return {
    requested,
    approved,
    status: row.status,
    deployId: row.deploy_id,
  };
}

export function normalizeCapabilities(raw: unknown): CapabilityDoc {
  const obj = (raw && typeof raw === "object" ? raw : {}) as Record<
    string,
    unknown
  >;
  const caps =
    obj.capabilities && typeof obj.capabilities === "object"
      ? (obj.capabilities as Record<string, unknown>)
      : obj;
  const asList = (v: unknown): string[] =>
    Array.isArray(v)
      ? v.filter((x): x is string => typeof x === "string").map((s) => s.trim()).filter(Boolean)
      : [];
  return {
    secrets: asList(caps.secrets),
    egress: asList(caps.egress),
    data: asList(caps.data),
  };
}

export async function approveCapabilities(
  env: Env,
  slug: string,
  approvedBy: string,
  approved?: CapabilityDoc | null,
): Promise<CapabilityDoc | null> {
  await ensureDb(env);
  const grant = await getCapabilityGrant(env, slug);
  if (!grant) return null;
  const finalApproved = approved ?? grant.requested;
  const now = new Date().toISOString();
  await env.DB.prepare(
    `UPDATE site_capability_grants
     SET approved_json = ?, status = 'approved', approved_at = ?, approved_by = ?, updated_at = ?
     WHERE slug = ?`,
  )
    .bind(JSON.stringify(finalApproved), now, approvedBy, now, slug)
    .run();
  return finalApproved;
}
