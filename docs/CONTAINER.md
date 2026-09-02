# Container Run — v0

**Goal:** paste a public repo that needs a process (`Dockerfile`, Express, Flask, …) → live URL.

Not a SKU. Not “rebuild Vercel.” Ephemeral try URL first (Rohit-style), same identity/share layer as Drop/Next.

## Why now

OpenNext Workers have **no project disk**. Apps that `fs.readdirSync` / run a long-lived Node/Python process need a **light Linux box**. Detect already returns `runtime: "container"`; we refused. Ship the runner.

## v0 shape

```text
detect → plan.runtime = container
  → queue run_jobs (kind: container)
  → aft-run-container Worker (Sandbox)
      clone → install (plan.install) → start (plan.build | start)
      → public upstream URL (tunnel)
  → mapping site on aft.page (runtime: worker + upstream)
  → slug.aft.page proxies like Next
```

Product copy: **build / start / live** — never Sandbox, Containers, Wrangler, tunnels in UI/logs (scrub).

Wrap, don’t rebuild: Sandbox **preview URLs** for the try URL if they work;
**credential injection + egress allow/deny + TLS intercept** for
`capabilities.egress` and the secrets vault (secret stays in the outbound
Worker, never in the box). Access-gate those preview URLs so they are not a
naked back door next to `*.aft.page`.

## In scope (v0)

- Public GitHub only (same as Run today)
- Node (`npm start` / `node server.js`) and Python (`uvicorn` / `flask` / `gunicorn`) when plan can invent a start command
- Nested Vite/static UI + Express/Flask API (`frontend/` + `backend/` or equivalent) as one URL
- Dockerfile: `docker build` + `docker run` **inside** Sandbox if image tooling is available; else honest fail with reason
- Idle sleep / destroy after timeout (ephemeral try)
- Job phases + streamed logs (scrubbed)

## Out of scope (v0)

- Persistent always-on containers / billing SKU
- Private repos
- Routing all Next apps through container (Next stays OpenNext; fs-broken Next can re-Run after SSG-cache fix, or later opt into container)
- Custom domains on the upstream (only `*.aft.page` mapping)

## Success

`POST /v1/repo/deploy` on an Express or Flask public repo → `202` → job live → URL loads without `needs_container`.

Quick Tunnel origins change when the box sleeps. `slug.aft.page` stays put: a 522/523/530 on that origin rebinds the tunnel and retries once.

## Smart deploy (AftRunAgent)

The Run job **is** the deploy agent (`AftRunAgent`, Cloudflare Agents SDK). One
instance per `jobId`. Product copy: **build / start / live**. MCP stays
`deploy_repo`. Cursor / `/run/` paste is the harness.

```text
clone in Sandbox
  → detect plan (hypothesis)
  → glm-4.7-flash decides patches (sqlite URI, hosts, CSRF, bind); glm-5.3-flash if that fails
  → sandbox tools (write/append file, set env) + check if needed
  → install → build → start → probe → slug.aft.page
  → on fail: up to 3 more agent turns, then honest fail
```

No hardcoded sed catalog for hosts/Postgres. The agent chooses the try URI
(sqlite on the box unless a real `DATABASE_URL` is in secrets). If the model is
down, the detect plan runs unpatched.

| Layer | Who |
| --- | --- |
| Intent / repo | `/run/` paste, MCP `deploy_repo`, later zip |
| Harness | Cursor / Claude / paste UI |
| Agent | `AftRunAgent` (one per job). Sub-agents later via `subAgent()` |
| Execute | Cloudflare Sandbox (tools) |
| Model | `@cf/zai-org/glm-4.7-flash` first via AI Gateway `default`; escalate to `glm-5.3-flash` if empty/unparsed/throw. Not Grok |
| URL + share | `*.aft.page` + invite ([SHARING.md](./SHARING.md)) |

Logs: job `logTail` (`Planning`, `Patching`, `Checking`, install/build/start).
AI Gateway spend + Workers Observability on this worker. ops job row = the trace.

**Wave v1:** public GitHub, known container stacks (Flask / Django / Express).
Static / Vite / Next stay on R2 / GHA / OpenNext.

**Wave v2:** unknown start, Docker vs Flask, frontend+backend misses, zip, newer
Python. Split Detect/Patch/Install sub-agents only if this class gets fat.

Pip still drops `backports.zoneinfo` (stdlib on 3.9+; no 3.10 wheel) — runner
image, not an app patch.

CRM zip ([USE-CASE-SALES-CRM.md](../../docs/USE-CASE-SALES-CRM.md)): Flask is v1
once zip is an input (v2). SQLite persist after try sleep is still later.
