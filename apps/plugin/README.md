# aft.page Agent Plugin

One portable [Agent Plugin](https://agent-plugins.org) that gives any compatible
agent a **Deploy with AFT** capability: publish HTML or a small static site to a
live `*.aft.page` URL — no account required. It bundles a deploy Skill plus the
thin remote MCP (`deploy` · `aft_deploys` · `aft_rollback` · `aft_health`). See the design
rationale in [`../../docs/ADR-MCP-THIN.md`](../../docs/ADR-MCP-THIN.md).

## Install

```bash
npx plugins add vaibhavmule/aft.page
```

Restart the agent. Then:

> Deploy this to aft.page

Works with Claude Code, Cursor, Codex, Copilot CLI, VS Code, Grok, and Kimi
via the [plugins](https://www.npmjs.com/package/plugins) installer. No GitHub
org required — this public repo is the source.

## Contents

```text
apps/plugin/
├── plugin.json              # Agent Plugins 1.0.0 manifest
├── mcp.json                 # remote MCP (spec)
├── .plugin/plugin.json      # same metadata for `npx plugins`
├── .mcp.json                # same MCP for `npx plugins`
└── skills/
    └── deploy-to-aft/
        └── SKILL.md
```

The MCP server is the frozen remote adapter at `https://mcp.aft.page/mcp`; the
plugin adds the Skill (instructions), not new tools.

## Manual MCP (no plugin)

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

## Check

```bash
node apps/plugin/check.mjs
npx plugins discover .
```

First deploys are public; return `claimUrl` only when the API provides a distinct
one. After claim, token updates 401 — do not mint a second URL.
