-- Marketing early-access email capture. Email is normalized before insertion.

CREATE TABLE IF NOT EXISTS waitlist_signups (
  id TEXT PRIMARY KEY NOT NULL,
  email TEXT NOT NULL UNIQUE,
  source TEXT NOT NULL DEFAULT 'marketing',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_waitlist_signups_created
  ON waitlist_signups(created_at DESC);
