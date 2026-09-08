-- Backfill completed Sep product/platform notes; tighten 8 Sep retire copy.
-- Do not changelog in-progress items (plugin marketplace, Code, WfP, Show HN).

UPDATE changelog_entries
SET title = 'Founder ops console, smoke suites, and macOS Drop removed',
    body = 'Worker SSR on ops.aft.page, the twice-daily smoke/audit cron, compat-probe, and the native macOS Drop app are gone. Public health is [status.aft.page](https://status.aft.page) (API, Website, Hosted apps, MCP). Customer Run builds via GitHub Actions, MCP/CLI deploy, Drop, and share are unchanged.'
WHERE id = 'retire-founder-tooling';

INSERT OR IGNORE INTO changelog_entries (id, day, category, kind, title, body, sort, created_at) VALUES
(
  'webmcp-surfaces',
  '2026-09-04',
  'product',
  'feat',
  'WebMCP on aft.page surfaces',
  'WebMCP-capable clients can call read-only tools on [/webmcp](https://aft.page/webmcp/) and confirmation-gated project tools. Drop and Run pages can publish HTML/files or `deploy_repo` through the same agent path. Docs: [/webmcp](https://aft.page/webmcp/), [/mcp](https://aft.page/mcp).',
  0,
  '2026-09-04T12:00:00.000Z'
),
(
  'container-idle-touch',
  '2026-09-06',
  'platform',
  'fix',
  'Dead containers no longer reset the idle clock',
  'Hosted container sites only count as “served” after the origin answers. Scanner hits and dead origins no longer block the 30-day unclaimed GC, and a dead origin returns a clear 503 instead of a bare 530.',
  0,
  '2026-09-06T12:00:00.000Z'
);
