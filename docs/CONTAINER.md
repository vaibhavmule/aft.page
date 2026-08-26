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

## In scope (v0)

- Public GitHub only (same as Run today)
- Node (`npm start` / `node server.js`) and Python (`uvicorn` / `flask` / `gunicorn`) when plan can invent a start command
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
