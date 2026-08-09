-- Forever status probe history (one row per component per check).

CREATE TABLE IF NOT EXISTS status_checks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  checked_at TEXT NOT NULL,
  overall TEXT NOT NULL,
  component_id TEXT NOT NULL,
  component_name TEXT NOT NULL,
  component_description TEXT NOT NULL DEFAULT '',
  url TEXT NOT NULL,
  ok INTEGER NOT NULL,
  status TEXT NOT NULL,
  http_status INTEGER,
  latency_ms INTEGER NOT NULL DEFAULT 0,
  error TEXT
);

CREATE INDEX IF NOT EXISTS idx_status_checks_checked_at
  ON status_checks(checked_at DESC);

CREATE INDEX IF NOT EXISTS idx_status_checks_failures
  ON status_checks(ok, checked_at DESC);
