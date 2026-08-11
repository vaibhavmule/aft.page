-- Tenant cron jobs (product parked: docs/parked/cron.md). Schema only.
CREATE TABLE IF NOT EXISTS site_crons (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL,
  path TEXT NOT NULL,
  schedule TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  last_run_at TEXT,
  last_status INTEGER,
  last_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS site_crons_slug ON site_crons(slug);
CREATE INDEX IF NOT EXISTS site_crons_enabled ON site_crons(enabled);
