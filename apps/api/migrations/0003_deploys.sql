-- Immutable deploy history.

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

ALTER TABLE sites ADD COLUMN last_served_at TEXT;
