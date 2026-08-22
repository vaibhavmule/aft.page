-- Product ships after hosted CLI (2026-08-11).
INSERT OR IGNORE INTO changelog_entries (id, day, category, title, body, sort, created_at) VALUES
(
  'title-slugs',
  '2026-08-12',
  'product',
  'Readable slugs from the page title',
  'Curl, MCP, and CLI deploys without `?slug=` now take the URL from `<title>` or `<h1>` — same as Drop. You get `signal-garden.aft.page` instead of a random eight-character slug when the document has a name.',
  0,
  '2026-08-12T12:00:00.000Z'
),
(
  'deploy-caps',
  '2026-08-14',
  'product',
  'Larger deploys: 500 files, 25 MB each, 100 MB total',
  'Limits match a typical built static site. Same ceiling on Drop, CLI, MCP, and the API.',
  0,
  '2026-08-14T12:00:00.000Z'
),
(
  'cli-preflight',
  '2026-08-14',
  'product',
  'CLI preflight before the upload',
  '`aft deploy` refuses a bad folder before POST, runs the project build when needed, and calls `/v1/cli/preflight` so a blocked deploy comes back with a why and a fix.',
  1,
  '2026-08-14T13:00:00.000Z'
);

UPDATE changelog_entries
SET body = 'Agents: use remote MCP ([`https://mcp.aft.page/mcp`](https://mcp.aft.page/mcp)) or the hosted CLI (`curl -fsSL https://aft.page/install | sh` → `aft deploy`). Humans: use [Drop](https://aft.page/drop/) or the same CLI. Per-IDE Agent Plugin / marketplace listings are coming soon.'
WHERE id = 'mcp-ready';
