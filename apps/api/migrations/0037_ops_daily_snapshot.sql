-- One row per UTC day of founder-ops counters, for yesterday-vs-day-before
-- deltas on the ops overview. Written by src/ops-snapshot.ts on the 5-min cron
-- (idempotent per day). No retroactive backfill — deltas need 2 days to appear.

CREATE TABLE IF NOT EXISTS ops_daily_snapshot (
  day TEXT PRIMARY KEY,          -- UTC YYYY-MM-DD
  sites INTEGER NOT NULL,
  claimed INTEGER NOT NULL,
  users INTEGER NOT NULL,
  waitlist INTEGER NOT NULL,
  domains INTEGER NOT NULL,
  deploys INTEGER NOT NULL,      -- total deploys ever
  deploy_bytes INTEGER NOT NULL,
  feedback INTEGER NOT NULL,
  views INTEGER NOT NULL,        -- HTML views that UTC day
  deploys_day INTEGER NOT NULL,  -- deploys created that day
  created_at TEXT NOT NULL
);
