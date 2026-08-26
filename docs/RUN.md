# Run — Layer 3 (runnable open source)

Category + GTM + build pipeline. Not canonical mission — see [`../rfs.txt`](../rfs.txt),
[STRATEGY.md](./STRATEGY.md). Updated: 2026-08-26.

**Layers:** [HOST.md](./HOST.md) · [SHIP.md](./SHIP.md) · **Run** (this doc) · [CODE.md](./CODE.md).

ChatGPT Sites is **Code** (prompt/template → D1 + R2), not Deploy. **Run is AFT’s category to create.**

## Category (create, don’t compare)

**GitHub is where open source lives. AFT is where you run it.**

Not hosting. Not CI green checks. Not Vercel preview URLs for maintainers.

| | Vercel / Netlify | AFT Run |
| --- | --- | --- |
| Who | Team already on platform | **Anyone** who found a repo |
| Input | Connected git + project config | **Repo URL / Run button** |
| Output | Preview on **your** PR | **Tryable app** for any visitor |
| OSS CRM on GitHub | README install steps | Live URL in minutes |

**GTM line:** The **run button the whole OSS stack forgot** — **CI that outputs a URL
instead of a score.**

## User story

> Paste any public GitHub repo → whatever it takes → live URL → try it.

**Node Workers = default compute.** Static = fast path (R2). Async builds OK — bar is
progress → URL → works, not 10 seconds.

## Triggers → artifact = URL

| Trigger | Surface |
| --- | --- |
| **Run on AFT** click | Chrome extension on GitHub |
| **`@aft deploy`** | GitHub App |
| Cron probe trending repos | compat-probe at scale + README PRs |
| MCP **`deploy_repo`** (future) | Agent with repo URL |

## Public paths (www)

| Path | Layer | Notes |
| --- | --- | --- |
| `/drop/` | Host | keep |
| `/ship/` (future) | Ship | agent hub |
| `/run/` (future) | Run | paste repo + job status |
| `aft.page` | hub | keep |

Subdomains (later): `drop.aft.page`, `run.aft.page`. `tryaft.com/owner/repo`
rewrites to Run. **`aft.run` is taken** — do not wait on it.

## Scale: 500 vs 5,000 deploys

### Static / Vite (R2)

**5,000+ deploys:** fine. No per-site Worker script. One platform Worker + R2 objects.
Viral static does **not** hit the 500-script cap.

### Next SSR / worker (one script per app)

**Without Workers for Platforms (WfP):** hard stop at **500 scripts** on Workers Paid.
You cannot run 5,000 Next SSR apps on plain aft-owned Workers.

**With WfP** ([ADR-TEMP-ACCOUNTS.md](./ADR-TEMP-ACCOUNTS.md)):

| Deploys (Next/worker) | Script cost (approx) | Notes |
| --- | --- | --- |
| 500 | $25/mo WfP floor | Old ADR “switch now” point |
| 5,000 | $25 + 4,000 × $0.02 ≈ **$105/mo** scripts | Scripts are cheap |
| 5,000 + traffic | + request/CPU overage | Can dominate bill before script cost |

**Runnable OSS at 5K:** plan **WfP before launch**, not at deploy #400. Mixed traffic:
most OSS tries may be static (cheap); Next fraction drives Worker count.

**Double-billing today:** platform Worker proxies to `aft-u-{slug}` = 2 inbound requests
per hit. WfP dispatch fixes that at scale.

## Build pipeline (required for Run)

**Detect → plan → one runner.** `/v1/repo/check` returns a build plan (`runtime`, `stack`, `install`, `build`, `outputDirs`). Drivers execute the plan; they do not hardcode Vite vs Angular.

| `runtime` | What happens |
| --- | --- |
| `static` | Sync `index.html` (and assets) now |
| `static_build` | Queue GHA `run-static-build` with plan install/build/outputDirs (Vite/Vue/Angular/CRA share this) |
| `next` | Queue GHA `run-next` (OpenNext + default config; Next 15 or 16; older versions fail honestly) |
| `container` | Queue Sandbox runner → process upstream → `*.aft.page` proxy ([CONTAINER.md](./CONTAINER.md)) |
| `not_a_site` | Refuse (queue/db only) |

Priority: Dockerfile/compose → `package.json` → Python (`requirements.txt` / `pyproject.toml` / `uv.lock`) → root `index.html`.

Today: upload finished files (Host/Ship). Run needs **honest jobs**:

```text
queued → cloning → installing → building → deploying → live | failed (reason + logs)
```

Never fake sync “200 OK” without a build.

### Option comparison

| Runner | What it is | AWS equivalent | When |
| --- | --- | --- | --- |
| **GitHub Actions** | Workflow on `aft.page` repo, isolated job clones untrusted repo | — (GHA is its own cloud) | **v1 bootstrap** — fastest to ship; real logs; compat-probe pattern |
| **Blacksmith** | Faster GHA runners | — | Same as GHA, lower latency `$` |
| **CF Sandbox** (`@cloudflare/sandbox`) | Container on CF edge runs `npm ci && build` | Fargate task / CodeBuild | **v2 native** — same vendor as runtime; isolate untrusted repos |
| **AWS CodeBuild** | Managed build container | — | Heavy / fallback tier |
| **Lambda + container** | Custom | CodeBuild / Batch | Overkill v1 |

### Why not “only CF Sandbox day one”?

Not because Sandbox is wrong — it’s the **right long-term** build plane on CF. Reasons
to allow GHA v1:

1. **compat-probe already runs** clone → build → deploy on a machine; GHA is that
   with a queue UI.
2. **Sandbox product integration** (queue Worker → Sandbox session → artifact → deploy)
   is still engineering — not a config toggle.
3. ADR spike: Sandbox on **temp accounts** not validated; prod path is aft-owned.

**Decision:** ship **job table + GHA dispatch v1**; parallel spike **Sandbox runner v2**
so build and runtime stay on Cloudflare. AWS CodeBuild only for detect tier escape
(middleware Next, Python web) later.

Untrusted repos: ephemeral job only, timeout, no outbound secrets to repo, delete workspace.

### Job API (sketch)

- `POST /v1/repo/deploy` → `{ jobId, status: "queued" }`
- `GET /v1/jobs/{id}` → `{ status, phase, logUrl?, url?, reason? }`
- Webhook from GHA/Sandbox → PATCH job → notify extension / `@aft` comment

## Runtime strategy

- Static / `static_build` → R2
- Next SSR → OpenNext + `aft-u-{slug}` + proxy ([OPENNEXT-ORCHESTRATION.md](./OPENNEXT-ORCHESTRATION.md))
  - Default OpenNext config uses **static-assets incremental cache** so prerendered pages (e.g. markdown blogs using `fs` at build time) do not re-run Node filesystem on the Worker.
  - GHA Next runner caches npm from the cloned lockfile; cold builds can still be multi-minute. Next 14 and older fail honestly.
- Docker / Python web → `container` runner ([CONTAINER.md](./CONTAINER.md))
- OpenNext middleware gap → detect + skip or AWS fallback tier
- DB: demo/UI-only now; D1/Turso full mode later

## Launch budget

**Amp, not the engine.** Show HN + Product Hunt flood a door that already
works. Owned channel is Agent Plugin / MCP; viral loop is README “Run on
AFT.” See [STRATEGY.md](./STRATEGY.md) § Mode stack.

**$1,000 USD** for that amp. Spend on Run compute (clone/build/deploy jobs,
failed builds, timeouts). Not influencers, ads, or mass README PRs. No
launch date — post when paste-repo → URL (or honest fail) works.

## Monetization

Virality first. Price later. Free try → claim / private / domains / DB / limits paid.

## Ship order

1. Honest Run job path (static / Vite / Next / container) → URL or fail reason
2. MCP `deploy_repo` + Cursor Agent Plugin marketplace listing (owned channel)
3. `/run/` paste UI + 30s demo clip
4. Show HN → PH ($1k builds) when #1 is stranger-proof
5. Targeted “Run on AFT” README buttons (not mass PRs)
6. Extension GitHub + `@aft` bot
7. WfP before viral Next fraction hits the 500-script wall
8. Remix/clone after try volume exists

## Related

- [HOST.md](./HOST.md) · [SHIP.md](./SHIP.md) · [CODE.md](./CODE.md)
- [CHATGPT-SITES.md](./CHATGPT-SITES.md)
- [qa/compat-probe/README.md](../qa/compat-probe/README.md)
