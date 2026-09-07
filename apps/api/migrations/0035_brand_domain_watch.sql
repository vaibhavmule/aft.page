-- Brand-domain release watch (aft.dev / aft.app): last known RDAP registration state.
-- Internal founder ops — surfaced on ops.aft.page Domains panel. Not a product table.
CREATE TABLE IF NOT EXISTS brand_domain_watch (
  domain TEXT PRIMARY KEY,
  status TEXT NOT NULL,          -- registered | available | unknown
  expires_at TEXT,               -- ISO date from RDAP expiration event
  registrar TEXT,                -- registrar entity name from RDAP
  error TEXT,                    -- last RDAP error when status = unknown
  checked_at TEXT NOT NULL,      -- last successful check
  changed_at TEXT NOT NULL       -- when status/expiry last changed
);
