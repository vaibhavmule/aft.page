# ADR: Thin MCP (not an MCP platform)

Status: Accepted  
Updated: 2026-08-09

## Context

MCP is how agents reach aft. Cloudflare’s [MCP v2 / createMcpHandler](https://blog.cloudflare.com/mcp-v2/)
makes remote MCP a stateless HTTP workload. We must not grow aft MCP into a
control plane, portal, or tool sprawl.

## Decision

**MCP is a thin adapter around the deploy URL.** Publishing, permissions, and
storage stay on aft.page / api.aft.page. MCP has no workspace FS — the agent
reads `aft.json` / `.aft/state.json` and passes slug + editToken.

### Tool freeze

| Tool | Job |
| --- | --- |
| `deploy` | `html` or `files` → live `*.aft.page` URL. With `edit_token` → PATCH same slug. |
| `aft_deploys` | List rollback-able deploys for a slug (editToken) |
| `aft_rollback` | Point the live slug at a prior deployId (editToken) |
| `aft_health` | Liveness |

First anonymous POST mints a unique slug (suffix on collision) + editToken.
Every later PATCH with that token is a new D1 `deploys` row on the **same**
URL. Rollback moves the live pointer. Claim attaches an owner; it does not
rename the slug. editToken dies on claim; later updates need a session
owner/editor. MCP has no session yet, so claimed sites are updated in the
project UI.

Rule: if a tool does not end in a **durable URL** (or health / the history
needed to restore one), it does not belong in MCP.

### Out of MCP

- Project list / inventory / billing / org admin
- Secrets vault management via MCP
- MCP gateway / enterprise portal product
- Sessionful `McpAgent` / Durable Object just to speak the protocol

### Transports

1. **Remote (preferred):** `https://mcp.aft.page/mcp` — Worker +
   `createMcpHandler`, calls `aft-page-api` over a Cloudflare service binding
   (`env.API.fetch`). Do not `fetch("https://api.aft.page/...")` from the MCP
   Worker — same-zone Worker fetch is unreliable.
2. **stdio (local/dev):** `@aft.page/mcp` package — optional fallback

Anonymous deploy stays. OAuth / claim elicitation later — not a login wall
before the first URL.

## Consequences

- Agents install via URL, not `npx tsx /ABSOLUTE/PATH/...`
- Agent Plugin wraps this thin MCP
- Website leads with remote config; stdio is “local / advanced”
- Agent persists `.aft/state.json` (gitignored). MCP is stateless.
