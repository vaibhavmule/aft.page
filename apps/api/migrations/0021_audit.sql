-- Hijack CIL scoreboard (ops.aft.page #audit). 14-day prune like smoke.
CREATE TABLE IF NOT EXISTS audit_runs (
  id TEXT PRIMARY KEY,
  ok INTEGER NOT NULL,
  trigger TEXT NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT NOT NULL,
  ms INTEGER NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_cases (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  case_id TEXT NOT NULL,
  ok INTEGER NOT NULL,
  ms INTEGER NOT NULL,
  detail TEXT NOT NULL DEFAULT '',
  url TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS audit_cases_run ON audit_cases(run_id);
CREATE INDEX IF NOT EXISTS audit_runs_created ON audit_runs(created_at);
