-- Soft on/off switch for a site. Deactivated sites keep their files + history
-- but stop serving (visitors get a paused page); the owner can reactivate.

ALTER TABLE sites ADD COLUMN active INTEGER NOT NULL DEFAULT 1;
