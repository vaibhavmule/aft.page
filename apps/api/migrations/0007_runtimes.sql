-- Runtime metadata + app secrets vault (distinct from edit-token site_secrets).

ALTER TABLE sites ADD COLUMN runtime TEXT NOT NULL DEFAULT 'static';
ALTER TABLE sites ADD COLUMN upstream_url TEXT;
ALTER TABLE sites ADD COLUMN main_module TEXT;

CREATE TABLE IF NOT EXISTS site_secret_values (
  slug TEXT NOT NULL REFERENCES sites(slug) ON DELETE CASCADE,
  name TEXT NOT NULL,
  ciphertext TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (slug, name)
);

CREATE INDEX IF NOT EXISTS idx_site_secret_values_slug ON site_secret_values(slug);
