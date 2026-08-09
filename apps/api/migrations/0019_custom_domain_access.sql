-- Custom domains are invite-only. users.custom_domains: NULL | requested | approved.
ALTER TABLE users ADD COLUMN custom_domains TEXT;

UPDATE users SET custom_domains = 'approved'
WHERE id IN (
  SELECT DISTINCT s.owner_user_id
  FROM custom_domains d
  JOIN sites s ON s.slug = d.slug
  WHERE s.owner_user_id IS NOT NULL
);

INSERT OR IGNORE INTO changelog_entries (id, day, category, title, body, sort, created_at) VALUES
(
  'custom-domains-gated',
  '2026-08-09',
  'product',
  'Custom domains are request-only',
  'The Domain tab lists hostnames and HTTPS progress. Adding a domain requires access — request from the project, founders approve on ops.aft.page.',
  1,
  '2026-08-09T12:00:00.000Z'
);
