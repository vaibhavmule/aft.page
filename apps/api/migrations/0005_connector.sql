-- Connector agent registration + invoke job queue (Week 3 v0).
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
