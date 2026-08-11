-- Align public changelog wording: agents = MCP|CLI; humans = Drop|CLI; plugins pending.
UPDATE changelog_entries
SET
  title = 'MCP and CLI ready for agents',
  body = 'Agents: use remote MCP ([`https://mcp.aft.page/mcp`](https://mcp.aft.page/mcp)) or the hosted CLI (`curl -fsSL https://aft.page/install | sh` → `aft deploy`). Humans: use [Drop](https://aft.page/drop/) or the same CLI. Per-IDE Agent Plugin / marketplace listings are still pending.'
WHERE id = 'mcp-ready';

UPDATE changelog_entries
SET
  body = 'Humans and agents: `curl -fsSL https://aft.page/install | sh` then `aft deploy`. Optional browser login for claim and ownership. Same durable `*.aft.page` URL as Drop and MCP. Agents can also use MCP; humans can also use [Drop](https://aft.page/drop/).'
WHERE id = 'hosted-cli';
