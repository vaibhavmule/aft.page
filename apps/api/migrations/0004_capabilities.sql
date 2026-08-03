-- Capability grants for aft.json approve-on-deploy.

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
