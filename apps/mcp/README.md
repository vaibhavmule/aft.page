# aft.page MCP

Thin MCP so **any agent** can deploy small software to a live URL —
no account required. Not a control plane (see
[`docs/ADR-MCP-THIN.md`](../../docs/ADR-MCP-THIN.md)).

## Prefer remote

| | |
| --- | --- |
| URL | `https://mcp.aft.page/mcp` |
| Tools | `deploy` · `aft_deploys` · `aft_rollback` · `aft_health` |
| Docs | https://aft.page/mcp · https://aft.page/mcp.md |

```json
{
  "mcpServers": {
    "aft-page": {
      "url": "https://mcp.aft.page/mcp"
    }
  }
}
```

Worker implementation: [`../mcp-worker`](../mcp-worker/).

## Local / advanced (this package)

stdio fallback for offline or patched use:

```bash
cd apps/mcp
npm install
npm start
```

```json
{
  "mcpServers": {
    "aft-page": {
      "command": "npx",
      "args": [
        "tsx",
        "/ABSOLUTE/PATH/TO/aft.page/apps/mcp/src/index.ts"
      ]
    }
  }
}
```

Optional env: `AFT_API_BASE` (default `https://api.aft.page`).
