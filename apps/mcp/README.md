# aft.page MCP

MCP server so **any agent** can deploy small software to a live `*.aft.page`
URL — no account required.

## Live docs (start here)

| Format | URL |
| --- | --- |
| HTML | https://aft.page/mcp |
| Markdown (agents) | https://aft.page/mcp.md |
| Agent index | https://aft.page/llms.txt |
| API | https://api.aft.page |
| Health | https://api.aft.page/health |

Those pages document tools, schemas, HTTP fallbacks, limits, slugs, and examples
in full. Prefer linking agents to **`mcp.md`** or **`llms.txt`**.

## Tools (summary)

| Tool | What it does |
| --- | --- |
| `deploy_html` | Publish one HTML document → `https://{slug}.aft.page` |
| `deploy_files` | Publish multiple static files (SPA / `dist`) |
| `aft_health` | Ping the API |

Also registers a prompt: `deploy_to_aft`.

## Run locally

```bash
cd apps/mcp
npm install
npm start   # stdio MCP server
```

## MCP host config

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

Then reload the host. Ask:

> Deploy this HTML to aft.page

Optional env:

- `AFT_API_BASE` — override API (default `https://api.aft.page`)
