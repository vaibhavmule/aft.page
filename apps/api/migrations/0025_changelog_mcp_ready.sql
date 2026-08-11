-- MCP is live; Agent Plugin / per-IDE marketplace still pending.
DELETE FROM changelog_entries WHERE id = 'agent-plugin';

INSERT OR IGNORE INTO changelog_entries (id, day, category, title, body, sort, created_at) VALUES
(
  'mcp-ready',
  '2026-08-11',
  'agents',
  'Remote MCP ready for agent deploys',
  'Point any MCP host at [`https://mcp.aft.page/mcp`](https://mcp.aft.page/mcp). Tools: `deploy`, `aft_deploys`, `aft_rollback`, `aft_health`. Docs: [/mcp](https://aft.page/mcp). Per-IDE Agent Plugin / marketplace listings are still pending — use MCP (or Drop / CLI / API) today.',
  1,
  '2026-08-11T18:30:00.000Z'
);
