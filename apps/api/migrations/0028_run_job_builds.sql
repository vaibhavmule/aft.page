-- Next.js Run builds: phase + log tail + job token. Static rows stay kind=static.

ALTER TABLE run_jobs ADD COLUMN kind TEXT NOT NULL DEFAULT 'static';
ALTER TABLE run_jobs ADD COLUMN phase TEXT NOT NULL DEFAULT 'queued';
ALTER TABLE run_jobs ADD COLUMN log_tail TEXT;
ALTER TABLE run_jobs ADD COLUMN job_token_hash TEXT;
ALTER TABLE run_jobs ADD COLUMN user_id TEXT;

CREATE INDEX IF NOT EXISTS idx_run_jobs_busy
  ON run_jobs(kind, status, created_at DESC);
