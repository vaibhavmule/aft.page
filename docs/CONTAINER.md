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

Quick Tunnel origins change when the box sleeps. `slug.aft.page` stays put: a 522/523/530 on that origin rebinds the tunnel and retries once. Health probes the Express fixture (`nodejs-getting-started-sky.aft.page`).

Django: Run rewrites empty `ALLOWED_HOSTS` to `['*']` and appends `CSRF_TRUSTED_ORIGINS` for `https://{slug}.aft.page` and `https://*.aft.page` so form POSTs work on the try URL. Pip drops `backports.zoneinfo` (stdlib on 3.9+; no 3.10 wheel).
