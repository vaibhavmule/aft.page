# aft.page Agent Plugin

One portable [Agent Plugin](https://agent-plugins.org) that gives any compatible
agent a **Deploy with AFT** capability: publish HTML or a small static site to a
live `*.aft.page` URL — no account required. It bundles a deploy Skill plus the
thin remote MCP (`deploy` · `aft_deploys` · `aft_rollback` · `aft_health`). See the design
rationale in [`../../docs/ADR-MCP-THIN.md`](../../docs/ADR-MCP-THIN.md).

## Contents

```text
apps/plugin/
├── plugin.json              # manifest ($schema + name)
├── mcp.json                 # remote MCP server (Streamable HTTP)
└── skills/
    └── deploy-to-aft/
        └── SKILL.md          # when + how to deploy; return the URL
```

The MCP server is the frozen remote adapter at `https://mcp.aft.page/mcp`; the
plugin adds the Skill (instructions), not new tools.

## Install in Cursor

1. Open **Customize** in the sidebar and go to **Rules**.
2. Click **Add Rule -> Remote Rule (GitHub)** and enter this repository's URL,
   or point Cursor at this `apps/plugin/` directory locally.
3. Reload. The `deploy-to-aft` skill appears under **Skills**, and the
   `aft-page` MCP server registers its tools.

The MCP block Cursor loads from `mcp.json`:

```json
{
  "mcpServers": {
    "aft-page": {
      "type": "streamable-http",
      "url": "https://mcp.aft.page/mcp"
    }
  }
}
```

## Try it

Ask your agent:

> Deploy this to aft.page

It should detect plain HTML vs a JS app (Vite/React/Next), run `npm run build`
when needed, call `deploy` on the **output**, and return
the live `*.aft.page` URL plus a claim/manage link.
