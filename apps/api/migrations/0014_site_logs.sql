-- Owner-visible serve log. No IPs. 7-day prune in status cron.
CREATE TABLE site_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL,
  created_at TEXT NOT NULL,
  method TEXT NOT NULL,
  path TEXT NOT NULL,
  status INTEGER NOT NULL,
  bytes INTEGER,
  country TEXT
);
CREATE INDEX site_logs_slug_created ON site_logs (slug, created_at DESC);
