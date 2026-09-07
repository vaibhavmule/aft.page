-- Changelog entries get a kind: feat | fix | imp (Command Code-style chips).
-- Existing rows: most are features; a few are refinements or corrections.
ALTER TABLE changelog_entries ADD COLUMN kind TEXT NOT NULL DEFAULT 'feat';

UPDATE changelog_entries SET kind = 'imp' WHERE id IN (
  'brand-identity',      -- marketing restyle (no new capability)
  'custom-domains-gated' -- domains moved to request-only (tightening)
);

UPDATE changelog_entries SET kind = 'fix' WHERE id IN (
  'og-previews' -- shipped to correct anonymous share-link previews
);
