# aft.page MCP

MCP server so **any agent** (Cursor, Claude Desktop, etc.) can deploy small
software to a live `*.aft.page` URL — no account, no GitHub, no Vercel.

## Tools

| Tool | What it does |
| --- | --- |
| `deploy_html` | Publish one HTML document → `https://{slug}.aft.page` |
| `deploy_files` | Publish multiple static files (SPA / Vite `dist`) |
| `aft_health` | Ping the API |

Also registers a prompt: `deploy_to_aft`.

## Run locally

```bash
cd apps/mcp
npm install
npm start   # stdio MCP server
```

## Cursor

Add to `~/.cursor/mcp.json` (or project `.cursor/mcp.json`):

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

Then restart Cursor / reload MCP. Ask the agent:

> Deploy this HTML to aft.page

It should call `deploy_html` and return a live URL.

Optional env:

- `AFT_API_BASE` — override API (default `https://api.aft.page`)

## Claude Desktop

Same command/args shape under `mcpServers` in Claude's config JSON.
