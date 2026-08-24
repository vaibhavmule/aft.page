# aft.page — MCP for agents

> Paste HTML or files. Get a live URL.
> No account. No repository. Built for AI agents first.

**Live docs (HTML):** https://aft.page/mcp  
**This file (Markdown):** https://aft.page/mcp.md  
**Agent index:** https://aft.page/llms.txt  
**Agents today:** MCP below, or hosted CLI (`curl -fsSL https://aft.page/install | sh` → `aft deploy`)  
**Humans:** [Drop](https://aft.page/drop/) or the same CLI  
**Open protocols:** MCP · Skills · Plugins · Unix/libaft — https://aft.page/plugins.md  

**Remote MCP:** https://mcp.aft.page/mcp  
**API:** https://api.aft.page  
**Health:** https://api.aft.page/health  
**Human Drop UI:** https://aft.page/drop/
**Claim:** `https://aft.page/claim?slug=&token=` (from deploy `claimUrl`), or Claim on the live URL.

---

## What aft.page is

aft.page hosts **small software** — one-pagers, prototypes, agent-built HTML, static SPAs — at a shareable HTTPS URL in seconds.

The name comes from the **aft of a ship** (the back of the vessel): take what you built and put it out into the world.

Agents should prefer the **MCP tools** below. If MCP is unavailable, call the **API** directly.

MCP is a **thin deploy adapter** (not a control plane): `deploy`, `aft_deploys`, `aft_rollback`, `aft_health`.

---

## MCP server

| Field | Value |
| --- | --- |
| Remote URL (preferred) | `https://mcp.aft.page/mcp` |
| Transport | Streamable HTTP (stateless) |
| Tools | `deploy` · `deploy_repo` · `aft_deploys` · `aft_rollback` · `aft_health` |
| Default API | `https://api.aft.page` |
| Local fallback | `apps/mcp` stdio (optional) |

### Wire into an MCP host (preferred)

```json
{
  "mcpServers": {
    "aft-page": {
      "url": "https://mcp.aft.page/mcp"
    }
  }
}
```

Reload the host. Then ask:

> Deploy this to aft.page

The agent should detect HTML vs a JS app, build if needed, call `deploy`,
persist `.aft/state.json`, and return the live URL. Later deploys pass
`edit_token` so the slug stays put.

### Local / advanced (stdio)

Only if you need an offline or patched server:

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

---

## Tools

aft.page does not build your app. The agent detects the project, builds locally
if needed, then uploads ready files.

| Project | What to upload |
| --- | --- |
| Plain HTML (`index.html`, no bundler) | `deploy` with `html` or those `files` |
| Vite / React / Vue | `npm run build` → **`dist/` only** |
| CRA / Rsbuild | `npm run build` → `build/` or `dist/` |
| Next static export (`output: 'export'`) | `npm run build` → **`out/`** |
| Next SSR (local repo) | Hosted CLI `aft deploy` (OpenNext + wrangler) |
| Next / Vite / static (public GitHub) | MCP `deploy_repo` or aft.page/run |

Never upload `src/`, `node_modules`, or `.next/`.

### 1. `deploy`

**When to use:** Publish. One page → `html`. Built folder → `files`. Not both required; `files` wins if both are set.

| Input | Type | Required | Notes |
| --- | --- | --- | --- |
| `html` | string | no | Full document; prefer `<!DOCTYPE html>…</html>` |
| `files` | array | no | Built output (`dist/` / `out/` / `build/`). Include `index.html`. |
| `files[].path` | string | yes | Relative path, e.g. `index.html`, `assets/app.js` |
| `files[].content` | string | yes | UTF-8 text, or base64 if `encoding=base64` |
| `files[].encoding` | `"utf8"` \| `"base64"` | no | Default `utf8` |
| `preferred_slug` | string | no | From `aft.json.slug`. First hit never overwrites — collision gets a suffix. Required with `edit_token`. |
| `edit_token` | string | no | From first deploy / `.aft/state.json`. PATCH same slug. |

**Limits:** 500 files · 25 MB per file · 100 MB total. Paths: no `..`, no leading `/`, no `\`.

**Returns (text + structuredContent):**

```
Live: https://{slug}.aft.page
Claim: https://aft.page/claim?slug=…&token=…
slug: …
deploy: dep_…
files: …
Unclaimed sites are deleted after 30 days idle. Visit, update, or claim to keep.
```

**Agent rules:**

- One tool. Build locally if needed, then `deploy`.
- Set `preferred_slug` from `aft.json.slug`. Include `aft.json` in `files`.
- After the first deploy, write `.aft/state.json` `{ slug, editToken }` and gitignore `.aft/`.
- Later deploys: pass that slug + `edit_token`. Claim does not change the slug.
- Always give the user **Live** and **Claim** URLs.
- Do not send them to `/preview` or ask them to create an account.

### 2. `aft_deploys`

**When to use:** List rollback history for a slug.

| Input | Type | Required | Notes |
| --- | --- | --- | --- |
| `slug` | string | yes | Locked site slug |
| `edit_token` | string | yes | From `.aft/state.json` |

Returns `currentDeployId` + deploys (newest first). Same D1 rows as the project UI.

### 3. `aft_rollback`

**When to use:** Restore a prior `deploy_id` from `aft_deploys`. Same live URL.

| Input | Type | Required | Notes |
| --- | --- | --- | --- |
| `slug` | string | yes | Locked site slug |
| `edit_token` | string | yes | From `.aft/state.json` |
| `deploy_id` | string | yes | Prior deploy id |

Claim is not required for unclaimed sites. After claim, editToken is dead;
use a session as owner/editor. MCP has no session yet.

### 4. `aft_health`

**When to use:** Connectivity check before deploy, or diagnose API issues.

No inputs. Returns `ok` and the API base URL.

---

## Prompt

### `deploy_to_aft`

Optional prompt that steers the agent:

- Detect first: plain HTML vs JS app (Vite/React/Next).
- Call `deploy` with `html` or `files`.
- Vite/React → `npm run build`, then `dist/` only. Next static export → `out/`.
- Pass `preferred_slug` when sensible; persist `.aft/state.json`; later deploys send `edit_token`.
- Return the live HTTPS URL.
- Do not send the user into account / repository setup flows.

Arg: `html_or_files` (optional string context).

---

## API (no MCP)

Base: `https://api.aft.page`  
CORS: `*` on deploy + site GET (for preview tooling).

### `GET /health`

```json
{ "ok": true }
```

### `GET /`

```json
{
  "service": "aft.page",
  "deploy": "POST /v1/deploy (multipart files, or text/html body)",
  "serve": "https://{slug}.aft.page or GET /s/{slug}/"
}
```

### `POST /v1/deploy`

Query: optional `?slug=preferred-name`

Header (optional): `X-Aft-Client: mcp|web|extension|curl|cli|mac` — used for product metrics.

**A) Raw HTML**

```http
POST /v1/deploy?slug=hello
Content-Type: text/html; charset=utf-8

<!DOCTYPE html><html><body><h1>Hi</h1></body></html>
```

**B) JSON files (agents)**

```http
POST /v1/deploy
Content-Type: application/json

{
  "files": [
    { "path": "index.html", "content": "<h1>App</h1>" },
    { "path": "style.css", "content": "body{margin:0}" }
  ]
}
```

**C) Multipart**

Form fields: `file0`, `file0_path`, `file1`, `file1_path`, … (or repeated `files`).

**Success (200):**

```json
{
  "ok": true,
  "slug": "hello",
  "deployId": "dep_…",
  "url": "https://hello.aft.page",
  "files": 1,
  "bytes": 42,
  "editToken": "aft_edit_…",
  "claimUrl": "https://aft.page/claim?slug=hello&token=…",
  "owned": false,
  "notice": "Unclaimed sites are deleted after 30 days idle. Visit, update, or claim to keep."
}
```

**Common errors:** `no_files`, `too_many_files`, `file_too_large`, `payload_too_large`, `bad_path`, `reserved_slug`, `slug_exhausted`, `internal`.

Invalid `?slug=` values (wrong pattern) are **ignored** — the Worker allocates a random unique slug instead of returning an error. Only reserved names return `reserved_slug`.

### Serving sites

| URL | Behavior |
| --- | --- |
| `https://{slug}.aft.page/` | Primary — serves `index.html` |
| `https://{slug}.aft.page/{path}` | Static asset |
| `https://api.aft.page/s/{slug}/` | Path fallback (same content) |

SPA-style: if the requested object is missing, the Worker soft-falls back to that deploy’s `index.html` (not only for extensionless paths).

Content-Type is derived from the **file extension** when the upload type is missing or `application/octet-stream` (so CSS is served as `text/css`).

---

## Slugs

1. Prefer valid `?slug=` / MCP `preferred_slug` when provided.
2. Else allocate a **random** unique slug.
3. Clients (paste UI, Chrome extension, agents) may derive a hint from HTML `<title>` / `<h1>` and pass it as `?slug=` / `preferred_slug` — the **Worker does not parse HTML for a name**.
4. **First POST never overwrites** — append a short word suffix (`about-me-mist`). **PATCH** with `edit_token` updates that slug in place (new history row).
5. Reserved (rejected with `reserved_slug`): `www`, `api`, `app`, `mcp`, `drop`, `ops`, `status`, `ai`, `cron`, `cname`, `claim`, …

Valid slug: lowercase letters, digits, hyphens; 1–48 chars; cannot start/end with `-`.

---

## Claim / manage

The live URL is the product. After deploy, open `claimUrl`
(`https://aft.page/claim?slug=&token=`) to add email or Google. Unclaimed sites
also show **Claim this site** on the live URL. After claim,
**Manage** goes to the project page. Keep `editToken` to prove you shipped.

---

## Limits (today)

| Limit | Value |
| --- | --- |
| Files per deploy | 500 |
| Per-file size | 25 MB |
| Total payload | 100 MB |
| Auth | None (anonymous deploys) |
| Unclaimed retention | Deleted after 30d idle. Visit, PATCH, or claim to keep. |
| Overwrite | First POST never (unique slug). PATCH + editToken = same URL + history. |
| Custom domains | After claim · request access · project Domains tab |
| Private / invite-by-email | After claim |

---

## Examples for agents

### Minimal HTML

Call `deploy` with `html`:

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>hello-agent</title>
  </head>
  <body>
    <h1>Hello from an agent</h1>
  </body>
</html>
```

`preferred_slug`: `hello-agent`

### Multi-file

Call `deploy` with `files`:

```json
[
  { "path": "index.html", "content": "<!DOCTYPE html><html><head><link rel=stylesheet href=style.css></head><body><h1>Hi</h1></body></html>" },
  { "path": "style.css", "content": "body{font-family:system-ui;background:#e8edf4}" }
]
```

### Curl smoke

```bash
curl -sS -X POST "https://api.aft.page/v1/deploy?slug=curl-smoke" \
  -H "content-type: text/html; charset=utf-8" \
  --data-binary @index.html
```

---

## Sanitization

Trailing UI junk after `</html>` (e.g. scraped “Deploy” labels) is stripped by the MCP server and the Worker before storage. Agents should still send clean HTML.

---

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| MCP tools missing | Reload MCP host; check absolute path to `src/index.ts`; Node 20+ |
| `reserved_slug` | Change title / slug |
| `file_too_large` / `payload_too_large` | Shrink assets; stay under limits |
| Unstyled CSS | Re-deploy after MIME fix; ensure path ends in `.css` |
| Site 404 | Wait a few seconds for DNS; try `/s/{slug}/` on the API host |
| Need to claim / private | Open `claimUrl` or Claim on the live URL; private after claim |

---

## Product URLs (bookmark)

- Website (agent-first): https://aft.page
- Drop / host / share / upload: https://aft.page/drop/ · [/host-html/](https://aft.page/host-html/) · [/share-html/](https://aft.page/share-html/) · [/upload-html/](https://aft.page/upload-html/)
- MCP docs (HTML): https://aft.page/mcp
- MCP docs (MD): https://aft.page/mcp.md
- llms.txt: https://aft.page/llms.txt
- API: https://api.aft.page
- Docs: https://aft.page/docs · agent index https://aft.page/docs.md · CLI https://aft.page/docs/cli/
- Example site: https://hello.aft.page · https://vite-hello.aft.page (Vite SPA)
- Metrics (internal): see repo `docs/METRICS.md`
- Hosted CLI: `curl -fsSL https://aft.page/install | sh` → `aft deploy` (no login). After claim: `aft login` for rename / env / rollback / sites ([CLI guide](https://aft.page/docs/cli/))
- OSS CLI (your cloud — different product): https://github.com/vaibhavmule/aft

---

## For agents reading this file

If the user asks to deploy, publish, host, or share a page:

1. Detect: plain HTML vs JS app (look at `package.json` / `vite.config.*` / `next.config.*`).
2. Build locally if it is a bundler app; upload `dist/` / `out/` / `build/` only.
3. Prefer MCP `deploy`. Persist `.aft/state.json`. Later ships pass `edit_token`.
4. Return the live URL.
5. Point humans at `claimUrl` (`https://aft.page/claim?slug=&token=`) to keep the site. Rollback via `aft_deploys` / `aft_rollback` or `PATCH` / `POST …/rollback` with the editToken.
6. Do not invent auth steps that do not exist yet.
