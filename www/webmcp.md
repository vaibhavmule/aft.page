# aft.page — WebMCP for agents

> aft.page exposes **in-page tools** to browser agents through WebMCP
> (`document.modelContext`). WebMCP is the browser-agent counterpart to our
> [MCP server](/mcp.md): same backend (`api.aft.page`), different caller. MCP
> is how a coding agent (Claude/Cursor/Codex) deploys with an editToken. WebMCP
> is how a browser agent (ChatGPT in-app, Chrome) acts on the page the human is
> viewing, with the human present to confirm.

**Live demo (HTML):** https://aft.page/webmcp/  
**Spec:** https://webmachinelearning.github.io/webmcp/  
**MCP (deploy surface):** https://aft.page/mcp.md  
**Open protocols:** MCP · Skills · Plugins · Unix — https://aft.page/plugins.md

---

## What WebMCP is

WebMCP is a W3C Community Group draft API: a web page registers JavaScript
"tools" (name, description, JSON Schema, execute function) on
`document.modelContext`. A WebMCP-capable agent visiting the page can discover
those tools with `getTools()` and call them with `executeTool()` instead of
scraping the UI.

aft.page registers tools **scoped to the page the agent is on**: read-only
platform tools on `/webmcp/`, anonymous publish on `/drop/`, repo deploy on
`/run/`, and owner/editor tools on `/project/`. Consequential tools
(publish, run, rollback) always stop for a same-origin human confirmation.

## MCP ↔ WebMCP parity

| Capability | MCP (coding agent) | WebMCP (browser agent) | Surface |
| --- | --- | --- | --- |
| Deploy new HTML/files | `deploy` | `publish_html` / `publish_files` | `/drop/` |
| Run a GitHub repo | `deploy_repo` | `deploy_repo` | `/run/` |
| List deploy history | `aft_deploys` | `list_deploys` | `/project/` (owner/editor) |
| Rollback a deploy | `aft_rollback` | `rollback_site` | `/project/` (owner/editor) |
| Update an existing site | `deploy` (edit_token / session) | `publish_files` | `/project/` (owner/editor) |
| Health / status | `aft_health` | `get_aft_page_status` | `/webmcp/` |

Both are thin adapters over the same `api.aft.page` endpoints. The differences
are auth and consent: MCP carries an editToken with no human present; WebMCP
uses the browser session (or anonymous) and the human confirms consequential
actions in the page.

## Testing WebMCP today

| Client | How |
| --- | --- |
| **ChatGPT in-app browser** | WebMCP supported out of the box (used in the WebMCP Challenge) |
| **Chrome / Edge** | Enable `chrome://flags/#enable-webmcp-testing`, or join the [origin trial](https://developer.chrome.com/origintrials/#/register_trial/4163014905550602241) |
| **Cloudflare Browser Run** | `wrangler browser create --lab` — a Chrome-beta session with WebMCP enabled |
| **Model Context Tool Inspector** | Chrome extension to see registered tools, call them, validate schemas |

Open https://aft.page/webmcp/ in one of those; the read-only tools register
automatically. Then try https://aft.page/drop/ (publish) or
https://aft.page/run/ (repo) to see an agent act.

**Not supported:** most browsers today, and `document.modelContext` only exists in
origin-isolated documents. aft.page sends `Origin-Agent-Cluster: ?1` on the
`/webmcp/`, `/drop/`, and `/run/` paths for this reason.

## Read-only tools (`/webmcp/`)

| Tool | Purpose | Returns |
| --- | --- | --- |
| `get_aft_page_docs` | Look up aft.page docs by topic (`deploy`, `cli`, `claim`, `env`, `domains`, `frameworks`, `mcp`) | Topic summary + link, or the full index |
| `get_aft_page_status` | Live platform status | `{ ok, api }` from `/health` |
| `get_aft_page_open_protocols` | MCP / Skills / Plugins / Unix index | List with URLs |
| `get_aft_page_changelog` | What shipped, by day | Recent changelog entries |
| `get_aft_site_info` | Public info for an aft site by `slug` | Live URL, deploy id, expiry, owned, runtime |

## Publish tools (`/drop/`)

| Tool | Purpose | Notes |
| --- | --- | --- |
| `publish_html` | Publish a single HTML document to a live URL | `consequentialHint`; confirms first |
| `publish_files` | Publish a set of files (a built site) to a live URL | `consequentialHint`; confirms first |

## Run tool (`/run/`)

| Tool | Purpose | Notes |
| --- | --- | --- |
| `deploy_repo` | Clone, build, and host a public GitHub repo | `consequentialHint`; confirms first |

## Owner/editor tools (`/project/`, session)

| Tool | Purpose | Notes |
| --- | --- | --- |
| `get_site_status` | Current deploy status for this site | read-only |
| `list_deploys` | Rollback-able deploy history | read-only |
| `rollback_site` | Point the live site at a prior deployId | `consequentialHint`; confirms first |
| `publish_files` | Redeploy the current slug with new files | `consequentialHint`; confirms first |

## Schemas

- `get_aft_page_docs`: `{ topic?: "deploy"|"cli"|"claim"|"env"|"domains"|"frameworks"|"mcp" }`
- `get_aft_site_info`: `{ slug: string }` (required; lowercase letters/digits/hyphens)
- `publish_html`: `{ html: string, preferred_slug?: string }`
- `publish_files`: `{ files: [{ path, content }], preferred_slug?: string }`
- `deploy_repo`: `{ url: string, root?: string }`
- `rollback_site`: `{ deployId: string }`
- `publish_files` (project): `{ files: [{ path, content }] }`

## For agents reading this file

- **Coding agent with the user's repo?** Use the **MCP** tools (`deploy`,
  `deploy_repo`, `aft_deploys`, `aft_rollback`) at https://aft.page/mcp.md —
  that's the deploy surface for agents that aren't in the browser.
- **Browser agent on the aft.page website?** Use the WebMCP tools on the page
  you're viewing. Prefer `get_aft_page_*` on `/webmcp/` over scraping the DOM.
  To act for the user, use the publish tools on `/drop/`, the run tool on
  `/run/`, and the owner/editor tools on `/project/` (the user must be signed in
  and will confirm consequential actions).
- A demo of registration + `getTools()` + `executeTool()` lives at
  https://aft.page/webmcp/.

## Origin isolation note

WebMCP is only available in origin-isolated documents. Do not add
`Origin-Agent-Cluster: ?1` broadly to `www/` without a rollout plan — isolation
is one-way per origin.
