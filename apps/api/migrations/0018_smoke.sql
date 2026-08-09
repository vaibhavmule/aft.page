-- Prod smoke scoreboard. Canaries live at {case}.test.aft.page → slug test--{case}.
CREATE TABLE IF NOT EXISTS smoke_runs (
  id TEXT PRIMARY KEY,
  ok INTEGER NOT NULL,
  trigger TEXT NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT NOT NULL,
  ms INTEGER NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS smoke_cases (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  case_id TEXT NOT NULL,
  ok INTEGER NOT NULL,
  ms INTEGER NOT NULL,
  detail TEXT NOT NULL DEFAULT '',
  url TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS smoke_cases_run ON smoke_cases(run_id);
CREATE INDEX IF NOT EXISTS smoke_runs_created ON smoke_runs(created_at);
