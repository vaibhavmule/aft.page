-- Restore Aug 12–14 (0027_changelog_aug14 was overwritten by run_jobs) plus
-- missing product days after that: Sign in with AFT (22), Run (24).
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
),
(
  'signin-with-aft',
  '2026-08-22',
  'product',
  'Sign in with AFT on hosted sites',
  'Every live slug exposes `/_aft/me` and **Sign in with AFT**. Apps can tell who is signed in; Worker and Next get identity headers. Same session as claim and invite.',
  0,
  '2026-08-22T12:00:00.000Z'
),
(
  'run-github',
  '2026-08-24',
  'product',
  'Run — paste a GitHub repo, get a live URL',
  'Public repo → detect → URL at [/run](https://aft.page/run/). Static is live in seconds; Vite and Next.js build in the background. Same `*.aft.page` as Drop and CLI. No account.',
  0,
  '2026-08-24T18:00:00.000Z'
),
(
  'deploy-repo',
  '2026-08-24',
  'agents',
  'MCP `deploy_repo` for public GitHub',
  'Point any MCP host at [`https://mcp.aft.page/mcp`](https://mcp.aft.page/mcp) and call `deploy_repo` with a GitHub URL. Same engine as [/run](https://aft.page/run/). Private repos are refused. Docs: [/mcp](https://aft.page/mcp).',
  1,
  '2026-08-24T18:30:00.000Z'
);

-- Keep the MCP tool list current.
UPDATE changelog_entries
SET body = 'Point any MCP host at `https://mcp.aft.page/mcp`. Tools: `deploy`, `deploy_repo`, `aft_deploys`, `aft_rollback`, `aft_health`. Docs: [/mcp](https://aft.page/mcp).'
WHERE id = 'remote-mcp';
