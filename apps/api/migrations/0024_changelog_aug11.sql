-- Product ships since custom domains (2026-08-09).
INSERT OR IGNORE INTO changelog_entries (id, day, category, title, body, sort, created_at) VALUES
(
  'hosted-cli',
  '2026-08-11',
  'product',
  'Hosted CLI — install and deploy from the terminal',
  '`curl -fsSL https://aft.page/install | sh` then `aft deploy`. Optional browser login for claim and ownership. Same durable `*.aft.page` URL as Drop and MCP.',
  0,
  '2026-08-11T18:00:00.000Z'
),
(
  'agent-plugin',
  '2026-08-10',
  'agents',
  'Agent Plugin install for coding agents',
  '`npx plugins add vaibhavmule/aft.page` — skill plus remote MCP for Cursor, Claude Code, Codex, and friends. Docs: [/plugins](https://aft.page/plugins).',
  0,
  '2026-08-10T08:00:00.000Z'
),
(
  'unclaimed-idle-delete',
  '2026-08-10',
  'product',
  'Unclaimed sites delete after 30 days idle',
  'Anonymous deploys no longer park. Visit, update, or [claim](https://aft.page/claim) to keep the URL. Deploy responses include the idle notice while the site is unclaimed.',
  1,
  '2026-08-10T09:00:00.000Z'
);

-- Keep the MCP entry current (tool names changed).
UPDATE changelog_entries
SET body = 'Point any MCP host at `https://mcp.aft.page/mcp`. Tools: `deploy`, `aft_deploys`, `aft_rollback`, `aft_health`. Docs: [/mcp](https://aft.page/mcp).'
WHERE id = 'remote-mcp';
