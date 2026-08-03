-- Private sites + invite-by-email (Google Doc–style sharing).

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
