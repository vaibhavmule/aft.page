# aft.page remote MCP Worker

Thin, **stateless** MCP server (ADR: [`docs/ADR-MCP-THIN.md`](../../docs/ADR-MCP-THIN.md)).

- URL: `https://mcp.aft.page/mcp`
- Tools: `deploy` · `aft_deploys` · `aft_rollback` · `aft_health`
- Calls `aft-page-api` over a service binding (`env.API`) — no public hostname hop, no Durable Object
- Production hostname `mcp.aft.page` is served by **aft-page-api** then bound here — two Workers Logs streams. Structured `{ where: "mcp" }` logs + AE `mcp` events. See [OPS.md](../../docs/OPS.md).

## Develop

```bash
cd apps/mcp-worker
npm install --legacy-peer-deps
npx wrangler dev
```

## Deploy

```bash
npx wrangler deploy
```

Custom domain: `mcp.aft.page` (see `wrangler.jsonc`).

## Client config (Cursor / Claude)

```json
{
  "mcpServers": {
    "aft-page": {
      "url": "https://mcp.aft.page/mcp"
    }
  }
}
```

Local stdio fallback remains in [`../mcp`](../mcp/).
