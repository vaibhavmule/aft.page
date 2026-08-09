-- Public product changelog. Founder edits via D1; marketing page GETs /v1/changelog.

CREATE TABLE IF NOT EXISTS changelog_entries (
  id TEXT PRIMARY KEY NOT NULL,
  day TEXT NOT NULL,
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  sort INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_changelog_day
  ON changelog_entries(day DESC, sort ASC);

INSERT OR IGNORE INTO changelog_entries (id, day, category, title, body, sort, created_at) VALUES
(
  'ai-discovery-files',
  '2026-08-08',
  'agents',
  'AI Discovery Files for agents and crawlers',
  '[`llms.txt`](https://aft.page/llms.txt), identity, brand, FAQ, and crawler directives so agents and search can find what aft.page is without scraping the marketing site.',
  0,
  '2026-08-08T00:00:00.000Z'
),
(
  'next-upstream',
  '2026-08-07',
  'platform',
  'Next.js via OpenNext upstream',
  'Next SSR and Worker apps deploy with `runtime: next` or `worker` plus an `upstream` target. Example: [next-hello.aft.page](https://next-hello.aft.page).',
  0,
  '2026-08-07T00:00:00.000Z'
),
(
  'waitlist',
  '2026-08-06',
  'product',
  'Waitlist for what comes after beta',
  'The homepage waitlist stores one email per address. Paid plans will be announced there before any billing begins.',
  0,
  '2026-08-06T00:00:00.000Z'
),
(
  'og-previews',
  '2026-08-06',
  'product',
  'Open Graph previews on deploys',
  'Shared `*.aft.page` links get a generated OG image — a pasted URL looks like an app, not a bare slug.',
  1,
  '2026-08-06T00:00:00.000Z'
),
(
  'claim-share',
  '2026-08-03',
  'product',
  'Claim, privacy, and invite-by-email',
  'Magic-link login, then claim an anonymous deploy. Keep it public, make it private, or invite specific people by email — and revoke access anytime.',
  0,
  '2026-08-03T00:00:00.000Z'
),
(
  'paste-url',
  '2026-07-26',
  'product',
  'Paste HTML, get a live URL',
  'Drop files or paste a document — no account, no repo. You get `https://{slug}.aft.page` in seconds. Collision suffixes a slug; nothing is overwritten.',
  0,
  '2026-07-26T00:00:00.000Z'
),
(
  'remote-mcp',
  '2026-07-26',
  'agents',
  'Remote MCP so agents can deploy',
  'Point any MCP host at `https://mcp.aft.page/mcp`. Three tools: `deploy_html`, `deploy_files`, `aft_health`. Docs: [/mcp](https://aft.page/mcp).',
  1,
  '2026-07-26T00:00:00.000Z'
);
