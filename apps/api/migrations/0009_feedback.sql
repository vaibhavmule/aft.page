-- Public product feedback captured from the marketing site + app pages.
-- message is required; email and page are optional context.

CREATE TABLE IF NOT EXISTS feedback (
  id TEXT PRIMARY KEY NOT NULL,
  message TEXT NOT NULL,
  email TEXT,
  page TEXT,
  source TEXT NOT NULL DEFAULT 'marketing',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_feedback_created
  ON feedback(created_at DESC);
