import type { Env } from "./env";

let migrated = false;

/** Run D1 migrations once per isolate (vitest + prod). */
export async function ensureDb(env: Env): Promise<void> {
  if (migrated) return;
  for (const migration of [
    MIGRATION_0001,
    MIGRATION_0002,
    MIGRATION_0003,
    MIGRATION_0004,
    MIGRATION_0005,
    MIGRATION_0006,
  ]) {
    const statements = migration
      .split(";")
      .map((s) => s.trim())
      .filter(Boolean);
    for (const sql of statements) {
      await env.DB.prepare(sql).run();
    }
  }
  try {
    await env.DB.prepare(
      `ALTER TABLE sites ADD COLUMN last_served_at TEXT`,
    ).run();
  } catch {
    /* column may already exist */
  }
  migrated = true;
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

export async function upsertSiteRow(
  env: Env,
  slug: string,
  deployId: string,
): Promise<void> {
  await ensureDb(env);
  const now = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO sites (slug, deploy_id, owner_user_id, visibility, created_at, updated_at)
     VALUES (?, ?, NULL, 'public', ?, ?)
     ON CONFLICT(slug) DO UPDATE SET deploy_id = excluded.deploy_id, updated_at = excluded.updated_at`,
  )
    .bind(slug, deployId, now, now)
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

const MIGRATION_0001 = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY NOT NULL,
  email TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sites (
  slug TEXT PRIMARY KEY NOT NULL,
  deploy_id TEXT NOT NULL,
  owner_user_id TEXT REFERENCES users(id),
  visibility TEXT NOT NULL DEFAULT 'public',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sites_owner ON sites(owner_user_id);
CREATE TABLE IF NOT EXISTS site_secrets (
  slug TEXT PRIMARY KEY NOT NULL,
  edit_token_hash TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS magic_links (
  id TEXT PRIMARY KEY NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL,
  email TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_magic_links_slug ON magic_links(slug);
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id),
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
`;

const MIGRATION_0002 = `
CREATE TABLE IF NOT EXISTS site_members (
  slug TEXT NOT NULL REFERENCES sites(slug) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'view',
  created_at TEXT NOT NULL,
  PRIMARY KEY (slug, user_id)
);
CREATE INDEX IF NOT EXISTS idx_site_members_email ON site_members(email);
CREATE TABLE IF NOT EXISTS site_invites (
  id TEXT PRIMARY KEY NOT NULL,
  slug TEXT NOT NULL REFERENCES sites(slug) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'view',
  token_hash TEXT NOT NULL UNIQUE,
  invited_by TEXT NOT NULL REFERENCES users(id),
  expires_at TEXT NOT NULL,
  accepted_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_site_invites_slug ON site_invites(slug);
CREATE INDEX IF NOT EXISTS idx_site_invites_email ON site_invites(email);
`;

const MIGRATION_0003 = `
CREATE TABLE IF NOT EXISTS deploys (
  id TEXT PRIMARY KEY NOT NULL,
  slug TEXT NOT NULL REFERENCES sites(slug) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  file_count INTEGER NOT NULL DEFAULT 0,
  bytes INTEGER NOT NULL DEFAULT 0,
  created_by_user_id TEXT REFERENCES users(id),
  source TEXT NOT NULL DEFAULT 'post'
);
CREATE INDEX IF NOT EXISTS idx_deploys_slug_created ON deploys(slug, created_at DESC);
`;

const MIGRATION_0004 = `
CREATE TABLE IF NOT EXISTS site_capability_grants (
  slug TEXT PRIMARY KEY NOT NULL REFERENCES sites(slug) ON DELETE CASCADE,
  requested_json TEXT NOT NULL,
  approved_json TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  deploy_id TEXT,
  approved_at TEXT,
  approved_by TEXT REFERENCES users(id),
  updated_at TEXT NOT NULL
);
`;

const MIGRATION_0005 = `
CREATE TABLE IF NOT EXISTS connectors (
  id TEXT PRIMARY KEY NOT NULL,
  slug TEXT NOT NULL REFERENCES sites(slug) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  label TEXT,
  last_seen_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_connectors_slug ON connectors(slug);
CREATE TABLE IF NOT EXISTS connector_invokes (
  id TEXT PRIMARY KEY NOT NULL,
  slug TEXT NOT NULL REFERENCES sites(slug) ON DELETE CASCADE,
  capability TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  result_json TEXT,
  error TEXT,
  created_at TEXT NOT NULL,
  completed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_connector_invokes_slug_status
  ON connector_invokes(slug, status, created_at);
`;

const MIGRATION_0006 = `
CREATE TABLE IF NOT EXISTS waitlist_signups (
  id TEXT PRIMARY KEY NOT NULL,
  email TEXT NOT NULL UNIQUE,
  source TEXT NOT NULL DEFAULT 'marketing',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_waitlist_signups_created
  ON waitlist_signups(created_at DESC);
`;

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

export async function insertDeploy(
  env: Env,
  opts: {
    id: string;
    slug: string;
    fileCount: number;
    bytes: number;
    createdByUserId?: string | null;
    source: "post" | "patch" | "rollback";
  },
): Promise<void> {
  await ensureDb(env);
  await env.DB.prepare(
    `INSERT INTO deploys (id, slug, created_at, file_count, bytes, created_by_user_id, source)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      opts.id,
      opts.slug,
      new Date().toISOString(),
      opts.fileCount,
      opts.bytes,
      opts.createdByUserId ?? null,
      opts.source,
    )
    .run();
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
  }[]
> {
  await ensureDb(env);
  const { results } = await env.DB.prepare(
    `SELECT id, created_at, file_count, bytes, source FROM deploys
     WHERE slug = ? ORDER BY created_at DESC LIMIT ?`,
  )
    .bind(slug, limit)
    .all<{
      id: string;
      created_at: string;
      file_count: number;
      bytes: number;
      source: string;
    }>();
  return (results || []).map((r) => ({
    id: r.id,
    createdAt: r.created_at,
    fileCount: r.file_count,
    bytes: r.bytes,
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

export async function listSitesByOwner(
  env: Env,
  ownerUserId: string,
): Promise<
  {
    slug: string;
    deployId: string;
    visibility: string;
    updatedAt: string;
    lastServedAt: string | null;
  }[]
> {
  await ensureDb(env);
  const { results } = await env.DB.prepare(
    `SELECT slug, deploy_id, visibility, updated_at, last_served_at
     FROM sites WHERE owner_user_id = ?
     ORDER BY updated_at DESC`,
  )
    .bind(ownerUserId)
    .all<{
      slug: string;
      deploy_id: string;
      visibility: string;
      updated_at: string;
      last_served_at: string | null;
    }>();
  return (results || []).map((r) => ({
    slug: r.slug,
    deployId: r.deploy_id,
    visibility: r.visibility,
    updatedAt: r.updated_at,
    lastServedAt: r.last_served_at ?? null,
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
