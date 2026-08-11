-- Founder 30-day check-in list (ops.aft.page/todos).
CREATE TABLE ops_checklist (
  id TEXT PRIMARY KEY,
  done INTEGER NOT NULL DEFAULT 0,
  note TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL
);
