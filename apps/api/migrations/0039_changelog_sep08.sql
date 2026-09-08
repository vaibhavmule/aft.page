-- Public changelog: founder tooling retire + status cleanup (8 Sep 2026).
INSERT OR IGNORE INTO changelog_entries (id, day, category, kind, title, body, sort, created_at) VALUES
(
  'retire-founder-tooling',
  '2026-09-08',
  'platform',
  'imp',
  'Leaner platform: founder ops, smoke, and macOS Drop removed',
  'The Worker ops console, twice-daily smoke/audit suites, compat-probe, and the macOS Drop app are gone. Scoreboard is D1 + [status.aft.page](https://status.aft.page). Customer Run builds (GitHub Actions), MCP/CLI deploy, and share stay. Product focus: zip / GitHub / agent output → live URL → auth → share.',
  0,
  '2026-09-08T12:00:00.000Z'
),
(
  'status-no-server-apps',
  '2026-09-08',
  'platform',
  'fix',
  'Status page drops Server apps probe',
  '[status.aft.page](https://status.aft.page) no longer shows the sleeping Express/container fixture as a major-outage strip. Public components are API, Website, Hosted apps, and MCP.',
  1,
  '2026-09-08T12:30:00.000Z'
);
