-- Custom hostnames (Cloudflare for SaaS) mapped to claimed sites.
CREATE TABLE custom_domains (
  hostname TEXT PRIMARY KEY NOT NULL,
  slug TEXT NOT NULL,
  status TEXT NOT NULL,
  cf_id TEXT,
  cf_route_id TEXT,
  txt_name TEXT,
  txt_value TEXT,
  ssl_status TEXT,
  error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX custom_domains_slug ON custom_domains (slug);

INSERT OR IGNORE INTO changelog_entries (id, day, category, title, body, sort, created_at) VALUES
(
  'custom-domains',
  '2026-08-09',
  'product',
  'Custom domains on claimed sites',
  'Owners can attach a hostname from the project **Domain** tab. CNAME to `cname.aft.page`, then HTTPS issues once DNS is live. The `*.aft.page` URL stays. Private sign-in still uses that subdomain.',
  0,
  '2026-08-09T00:00:00.000Z'
);
