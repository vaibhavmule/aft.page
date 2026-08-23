-- GitHub Run jobs (paste repo → URL). One row per attempt.

CREATE TABLE IF NOT EXISTS run_jobs (
  id TEXT PRIMARY KEY NOT NULL,
  created_at TEXT NOT NULL,
  finished_at TEXT,
  owner TEXT NOT NULL,
  repo TEXT NOT NULL,
  url TEXT NOT NULL,
  trigger TEXT NOT NULL DEFAULT 'web',
  status TEXT NOT NULL,
  error TEXT,
  reason TEXT,
  slug TEXT,
  site_url TEXT,
  branch TEXT,
  ms INTEGER,
  http_status INTEGER
);

CREATE INDEX IF NOT EXISTS idx_run_jobs_created ON run_jobs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_run_jobs_status ON run_jobs(status, created_at DESC);
