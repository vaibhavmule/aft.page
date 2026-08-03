-- Claim auth v1: site registry, users, edit tokens, magic links, sessions.

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
  slug TEXT PRIMARY KEY NOT NULL REFERENCES sites(slug) ON DELETE CASCADE,
  edit_token_hash TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS magic_links (
  id TEXT PRIMARY KEY NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL REFERENCES sites(slug),
  email TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_magic_links_slug ON magic_links(slug);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
