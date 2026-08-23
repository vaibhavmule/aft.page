import type { Env } from "../env";
import { ensureDb } from "./core";

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
