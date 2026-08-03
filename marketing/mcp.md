# aft.page — MCP for agents

> Paste HTML or files. Get a live `https://{slug}.aft.page` URL.
> No account. No repository. Built for AI agents first.

**Live docs (HTML):** https://aft.page/mcp  
**This file (Markdown):** https://aft.page/mcp.md  
**Agent index:** https://aft.page/llms.txt  
**API:** https://api.aft.page  
**Health:** https://api.aft.page/health  
**Human paste UI:** https://aft.page/paste-html/
**Preview / claim shell:** https://aft.page/preview?url=https://{slug}.aft.page

---

## What aft.page is

aft.page hosts **small software** — one-pagers, prototypes, agent-built HTML, static SPAs — at a shareable HTTPS URL in seconds.

The name comes from the **aft of a ship** (the back of the vessel): take what you built and put it out into the world.

Agents should prefer the **MCP tools** below. If MCP is unavailable, call the **HTTP API** directly.

---

## MCP server

| Field | Value |
| --- | --- |
| Package (local) | `apps/mcp` in the aft.page repo (`@aft.page/mcp`) |
| Transport | **stdio** (Model Context Protocol) |
| Runtime | Node.js **20+** |
| Default API | `https://api.aft.page` |
| Env override | `AFT_API_BASE` (optional; no trailing slash) |

### Install / run

```bash
cd apps/mcp
npm install
npm start   # stdio MCP server
```

### Wire into an MCP host

Add a server named `aft-page` that runs the local entrypoint via `npx tsx`:

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

Optional env:

```json
{
  "mcpServers": {
    "aft-page": {
      "command": "npx",
      "args": ["tsx", "/ABSOLUTE/PATH/TO/aft.page/apps/mcp/src/index.ts"],
      "env": {
        "AFT_API_BASE": "https://api.aft.page"
      }
    }
  }
}
```

Reload / restart the MCP host after editing config. Then ask:

> Deploy this HTML to aft.page

The agent should call `deploy_html` and return the live URL.

---

## Tools

### 1. `deploy_html`

**When to use:** Single HTML document (inline CSS/JS is fine). Prefer this for “one file” pages.

| Input | Type | Required | Notes |
| --- | --- | --- | --- |
| `html` | string | yes | Full document; prefer `<!DOCTYPE html>…</html>` |
| `preferred_slug` | string | no | Hint like `about-me`. Pattern: `^[a-z0-9](?:[a-z0-9-]{0,46}[a-z0-9])?$`. Never overwrites an existing site — collision gets a suffix (`about-me-mist`). |

**Returns (text + structuredContent):**

```
Live: https://{slug}.aft.page
Manage/claim: https://aft.page/preview?url=…
slug: …
deploy: dep_…
files: 1
```

**Agent rules:**

- Pass the full HTML the user (or you) just built.
- Set `preferred_slug` from `<title>` or a short project name when sensible.
- Always give the user the **Live** HTTPS URL — that is the deliverable.
- Also share **Manage/claim** when they need copy / preview / claim UI.
- Do not ask them to create an account or connect a repository.

### 2. `deploy_files`

**When to use:** Multiple static files (HTML + CSS + JS + assets), or a build output folder (`dist/`). Must include a homepage (`index.html`).

| Input | Type | Required | Notes |
| --- | --- | --- | --- |
| `files` | array | yes | 1–50 items |
| `files[].path` | string | yes | Relative path, e.g. `index.html`, `assets/app.js` |
| `files[].content` | string | yes | UTF-8 text, or base64 if `encoding=base64` |
| `files[].encoding` | `"utf8"` \| `"base64"` | no | Default `utf8` |
| `preferred_slug` | string | no | Same rules as `deploy_html` |

**Limits:** 50 files · 2 MB per file · 5 MB total.

**Path rules:** No `..`, no leading `/`, no `\`.

**Agent rules:**

- Always include `index.html` (or the site has no homepage).
- Binary assets → `encoding: "base64"`.
- Prefer relative asset paths that match how the HTML references them.

### 3. `aft_health`

**When to use:** Connectivity check before deploy, or diagnose API issues.

No inputs. Returns `ok` and the API base URL.

---

## Prompt

### `deploy_to_aft`

Optional prompt that steers the agent:

- Prefer `deploy_html` for one document.
- Prefer `deploy_files` for multi-file / SPA.
- Pass `preferred_slug` when sensible.
- Return the live HTTPS URL.
- Do not send the user into account / repository setup flows.

Arg: `html_or_files` (optional string context).

---

## HTTP API (no MCP)

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

Header (optional): `X-Aft-Client: mcp|web|extension|curl|cli` — used for product metrics.

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
  "bytes": 42
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
4. **Never overwrite** an existing slug — append a short word suffix (`about-me-mist`).
5. Reserved (rejected with `reserved_slug`): `www`, `api`, `app`, `mail`, `ftp`, `cdn`, `static`, `admin`, `dashboard`, `status`, `docs`, …

Valid slug: lowercase letters, digits, hyphens; 1–48 chars; cannot start/end with `-`.

---

## Preview shell

After deploy, humans manage the site at:

```
https://aft.page/preview?url=https://{slug}.aft.page
```

Optional `from=` (chat URL) shows “Back to chat” when the host is an allowed chat app.

Preview features: live iframe, indented source viewer, copy link, download HTML, visibility stubs (coming soon).

Only `*.aft.page` URLs are allowed in `url=` (no open redirects).

---

## Limits (today)

| Limit | Value |
| --- | --- |
| Files per deploy | 50 |
| Per-file size | 2 MB |
| Total payload | 5 MB |
| Auth | None (anonymous deploys) |
| Overwrite | Never (unique slug) |
| Custom domains | Later |
| Private / invite-by-email | Later (UI stub only) |

---

## Examples for agents

### Minimal HTML

Call `deploy_html` with:

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

Call `deploy_files` with:

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
| Need to claim / private | Not shipped yet — use preview “Claim” / visibility stubs |

---

## Product URLs (bookmark)

- Marketing (agent-first): https://aft.page
- Paste / host / share / upload: https://aft.page/paste-html/ · [/host-html/](https://aft.page/host-html/) · [/share-html/](https://aft.page/share-html/) · [/upload-html/](https://aft.page/upload-html/)
- MCP docs (HTML): https://aft.page/mcp
- MCP docs (MD): https://aft.page/mcp.md
- llms.txt: https://aft.page/llms.txt
- API: https://api.aft.page
- Example site: https://hello.aft.page
- Metrics (internal): see repo `docs/METRICS.md`
- OSS CLI (your cloud): https://github.com/vaibhavmule/aft

---

## For agents reading this file

If the user asks to deploy, publish, host, or share a page:

1. Prefer MCP `deploy_html` or `deploy_files`.
2. Return the live `https://{slug}.aft.page` URL.
3. Optionally link `https://aft.page/preview?url=…`.
4. Do not invent auth steps that do not exist yet.
