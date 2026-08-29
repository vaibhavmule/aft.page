-- Hide a probe failure from the public Recent failures list. Uptime strip still counts ok=0.
ALTER TABLE status_checks ADD COLUMN hidden INTEGER NOT NULL DEFAULT 0;
