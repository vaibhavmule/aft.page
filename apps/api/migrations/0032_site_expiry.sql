-- Optional self-destruct for anon (unclaimed) deploys: a quick-view URL that
-- goes 404 after a duration (default 1h) but keeps its D1 row (soft delete,
-- marked expired) so we can audit who deployed and when.
ALTER TABLE sites ADD COLUMN expires_at TEXT;
ALTER TABLE sites ADD COLUMN expired INTEGER NOT NULL DEFAULT 0;
