-- Failed deploy attempts (successes stay in deploys).

CREATE TABLE IF NOT EXISTS deploy_failures (
  id TEXT PRIMARY KEY NOT NULL,
  created_at TEXT NOT NULL,
  error TEXT NOT NULL,
  path TEXT,
  slug TEXT,
  source TEXT NOT NULL DEFAULT 'other',
  files INTEGER,
  bytes INTEGER,
  http_status INTEGER NOT NULL,
  request_id TEXT NOT NULL,
  hint TEXT
);

CREATE INDEX IF NOT EXISTS idx_deploy_failures_created
  ON deploy_failures(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_deploy_failures_error
  ON deploy_failures(error, created_at DESC);
