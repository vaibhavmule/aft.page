# aft.page docs (agent index)

> Human guides (detailed HTML): https://aft.page/docs  
> MCP / API schemas: https://aft.page/mcp.md  
> This file is a short index for agents — not a twin of the HTML docs.

aft.page is a **file host + permission layer** for small software. It does not
run `npm run build`. Detect the project, build locally if needed, upload ready
files → durable `https://{slug}.aft.page`.

## What we host

| Kind | Ship |
| --- | --- |
| Plain HTML | files with `index.html` |
| Vite / React / Vue / … | `npm run build` → **`dist/` only** |
| Next static export | `output: 'export'` → **`out/`** |
| Next SSR / Worker | OpenNext (or Worker) + `aft.json` `upstream` |

Never upload `src/`, `node_modules`, or `.next/`. Details: https://aft.page/docs/frameworks/

## Ship

- **Drop:** https://aft.page/drop/ — folder or zip
- **MCP:** `https://mcp.aft.page/mcp` — tools in https://aft.page/mcp.md
- **CLI (no login):** `curl -fsSL https://aft.page/install | sh` then `aft deploy`
- **API:** `POST https://api.aft.page/v1/deploy`

CLI auto-picks `dist/` / `out/` / `build/`, writes `aft.json` on first deploy.
Guide: https://aft.page/docs/cli/

## Manage (after claim + `aft login`)

Claim: https://aft.page/docs/claim/  
Then same as the project dashboard:

| Command | Guide |
| --- | --- |
| `aft rename <slug>` | /docs/cli/ · /docs/claim/ |
| `aft env list\|set\|unset` | /docs/env/ |
| `aft visibility public\|private` | /docs/claim/ |
| `aft rollback [deployId]` | /docs/cli/ |
| `aft sites` / `aft open` | /docs/cli/ |
| `aft update` | /docs/cli/ |
| Custom domains | /docs/domains/ |
| `aft.json` capabilities | /docs/capabilities/ |

Unclaimed sites deleted after 30 days idle. Limits: 200 files · 10 MB/file · 50 MB.
Claimed sites can be paused (reversible) or destroyed (irreversible) — see /docs/claim/.

## Links

- Docs hub: https://aft.page/docs
- CLI: https://aft.page/docs/cli/
- Claim & share: https://aft.page/docs/claim/
- Secrets: https://aft.page/docs/env/
- Domains: https://aft.page/docs/domains/
- Capabilities: https://aft.page/docs/capabilities/
- Frameworks: https://aft.page/docs/frameworks/
- MCP: https://aft.page/mcp.md
- Examples: https://github.com/vaibhavmule/aft.page/tree/main/examples
