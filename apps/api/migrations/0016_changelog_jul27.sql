-- Date from transcript + file batch, not the Aug 3 commit that finally landed them.
-- Skip metrics (ops) and OpenNext research (shipped 7 Aug as next-upstream).

UPDATE changelog_entries SET day = '2026-07-27' WHERE id = 'claim-share';

INSERT OR IGNORE INTO changelog_entries (id, day, category, title, body, sort, created_at) VALUES
(
  'seo-landings',
  '2026-07-27',
  'product',
  'SEO pages for paste, host, and share',
  'Intent landings for paste / host / share / upload HTML — same Drop product, indexed for people who are not coming from an agent. Now at [/drop](https://aft.page/drop/), [/host-html](https://aft.page/host-html/), [/share-html](https://aft.page/share-html/).',
  1,
  '2026-07-27T00:00:00.000Z'
),
(
  'brand-identity',
  '2026-08-03',
  'product',
  'Marketing restyled so it does not read as another Carrd',
  'Homepage and docs moved to black/white agent-infra craft (Geist, white CTA, green for live only) after the landing looked too close to Claude.',
  0,
  '2026-08-03T00:00:00.000Z'
);
