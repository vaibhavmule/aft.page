# Extending aft — open protocols

> Markdown: https://aft.page/plugins.md  
> HTML: https://aft.page/plugins

aft does not grow a proprietary agent island. Agents reach it through open
protocols. Then Unix.

| | Spec | AFT |
| --- | --- | --- |
| **MCP** | [modelcontextprotocol.io](https://modelcontextprotocol.io) | `https://mcp.aft.page/mcp` — tools in [mcp.md](https://aft.page/mcp.md) |
| **Skills** | [agentskills.io](https://agentskills.io) | `skills/deploy-to-aft/SKILL.md` inside the plugin |
| **Plugins** | [agent-plugins.org](https://agent-plugins.org) | `npx plugins add vaibhavmule/aft.page` |
| **Unix** | — | ① small programs (`aft deploy`, curl) ② **libaft** — embed deploy in your own CLI, background agent, or software factory |

Per-IDE marketplace listings can lag. The portable plugin, remote MCP, CLI, and
libaft work today. Cursor: `npx plugins add vaibhavmule/aft.page`. Claude Code:
`/plugin marketplace add vaibhavmule/aft.page` then
`/plugin install aft-page@aft-page`. Official MCP registry: [`page.aft/mcp`](https://registry.modelcontextprotocol.io/v0.1/servers?search=page.aft%2Fmcp) (remote `https://mcp.aft.page/mcp`). Do not invent a fourth agent format.

## MCP

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

Thin deploy adapter, not a control plane: `deploy` · `deploy_repo` ·
`aft_deploys` · `aft_rollback` · `aft_health`. Docs: https://aft.page/mcp.md

## Skills

The plugin ships an Agent Skill (`deploy-to-aft`). Compatible hosts load
`SKILL.md` as reusable instructions: build locally, upload artifacts, persist
`.aft/state.json`, return the live URL.

## Plugins

```bash
npx plugins add vaibhavmule/aft.page
```

or `aft plugins add`. Restart the host, then: *Deploy this to aft.page*.

Package: Skill + remote MCP. No extra tools.

## Unix

1. Small programs that do one thing and compose: `aft deploy`, `curl`, MCP
   tools. Pipe, script, cron.
2. **libaft** (`apps/sdk`, `createAft`) — embed the deploy API in a more
   complex program. Your CLI, a background agent, a software factory. Local or
   cloud. You do not have to speak MCP.

```js
import { createAft } from "@aft.page/sdk";
const aft = createAft();
const site = await aft.deploy({ html: "<h1>hello</h1>" });
```

Humans who do not want an agent: [Drop](https://aft.page/drop/) or the same CLI.
