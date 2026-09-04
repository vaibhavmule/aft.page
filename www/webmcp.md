# aft.page — WebMCP for agents

> aft.page exposes **read-only in-page tools** to browser agents through WebMCP
> (`document.modelContext`). This is separate from our [MCP server](/mcp.md),
> which is how coding agents deploy.

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

aft.page registers tools that expose **the same public information the site
already shows** — docs, platform status, open protocols, changelog, and public
site info. All tools are read-only (`readOnlyHint`) and make no state changes.

## Testing WebMCP today

| Client | How |
| --- | --- |
| **ChatGPT in-app browser** | WebMCP supported out of the box (used in the WebMCP Challenge) |
| **Chrome / Edge** | Enable `chrome://flags/#enable-webmcp-testing`, or join the [origin trial](https://developer.chrome.com/origintrials/#/register_trial/4163014905550602241) |
| **Model Context Tool Inspector** | Chrome extension to see registered tools, call them, validate schemas |

Open https://aft.page/webmcp/ in one of those. Click **Load demo tools** (or add
`?demo=1`), then ask the agent to call e.g. `get_aft_page_status`.

**Not supported:** most browsers today, and `document.modelContext` only exists in
origin-isolated documents. aft.page sends `Origin-Agent-Cluster: ?1` on the
`/webmcp/` demo path for this reason.

## Tools

All tools are **read-only**, same-origin, and hit only public endpoints.

| Tool | Purpose | Returns |
| --- | --- | --- |
| `get_aft_page_docs` | Look up aft.page docs by topic (`deploy`, `cli`, `claim`, `env`, `domains`, `frameworks`, `mcp`) | Topic summary + link, or the full index |
| `get_aft_page_status` | Live platform status | `{ ok, api }` from `/health` |
| `get_aft_page_open_protocols` | MCP / Skills / Plugins / Unix index | List with URLs |
| `get_aft_page_changelog` | What shipped, by day | Recent changelog entries |
| `get_aft_site_info` | Public info for an aft site by `slug` | Live URL, deploy id, expiry, owned, runtime |

### Schemas

- `get_aft_page_docs`: `{ topic?: "deploy"|"cli"|"claim"|"env"|"domains"|"frameworks"|"mcp" }`
- `get_aft_site_info`: `{ slug: string }` (required; lowercase letters/digits/hyphens)

The others take no input.

## For agents reading this file

- If the user wants to **publish/deploy** something to aft.page, use the **MCP**
  `deploy` / `deploy_repo` tools (https://aft.page/mcp.md) — not WebMCP. WebMCP
  tools are read-only.
- If the user is **on the aft.page website** in a WebMCP-capable client, prefer
  the WebMCP tools above over scraping the DOM: `get_aft_page_docs`,
  `get_aft_page_status`, `get_aft_page_changelog`, and `get_aft_site_info` give
  you the canonical answer.
- A demo of registration + `getTools()` + `executeTool()` lives at
  https://aft.page/webmcp/.

## Origin isolation note

WebMCP is only available in origin-isolated documents. Do not add
`Origin-Agent-Cluster: ?1` broadly to `www/` without a rollout plan — isolation
is one-way per origin.
