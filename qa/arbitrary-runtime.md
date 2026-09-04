# Arbitrary-code runtime — test plan

**Goal:** Paste any public GitHub repo → honest URL or honest fail. Not “every language invent.”

Self-healing runtime = **ensureRuntime** (install missing toolchain) + invent start/install when stack known + agent config patches. Escape hatch = **DinD** when the plan is Dockerfile. DB wire protocol (pg/mysql) = **need-pg** until Neon, not rewrite.

## What “arbitrary” means (ceiling)

| Layer | Owns | Does not own |
| --- | --- | --- |
| Detect → plan | stack, install, start, docker | Invent unknown languages forever |
| ensureRuntime | python/pip, ruby/bundler, elixir, node | Full asdf / every version pin |
| try-sqlite | Django/SQLAlchemy/Rails-sqlite ORM | Postgres wire → Neon later |
| Agent | hosts, one-file settings | Rewrite Prisma/Ecto to sqlite |
| DinD | `docker build` + `docker run --network=host` | Compose multi-service / k8s |

## Test layers (run in order)

1. **Unit / assert checks** (no network)  
   `cd apps/run-container && npm run check`  
   Plus: `ensure-runtime.check.ts`, `try-sqlite.check.ts`, engine-kind / CLI detect mirrors.

2. **Detect matrix** (`POST /v1/repo/check`) — plan shape only  

   | Fixture | Expect |
   | --- | --- |
   | heroku/node-js-getting-started | Express invent start, port 8080 |
   | mdn/django-locallibrary-tutorial | Django / pip / manage.py |
   | heroku/ruby-getting-started | Rails, `bundle install`, `rails server` |
   | chrismccord/phoenix_live_view_example | Phoenix / mix |
   | docker/getting-started (or tiny Dockerfile site) | stack Docker, build+run with `--network=host` |
   | rails/rails | `not_a_site` (library) |

3. **Live honesty corpus** (`POST /v1/repo/deploy`) — URL or named fail  

   Record job id, wall, reason. Do not grow into compat-probe.

   | Fixture | Expect | Pass if |
   | --- | --- | --- |
   | heroku/node-js-getting-started | live 200 | tunnel + GET |
   | mdn/django-locallibrary-tutorial | live (sqlite orm) | GET catalog |
   | heroku/ruby-getting-started | **need-pg** (pg gem) | reason cites try-db; not missing-start / not tunnel |
   | Rails + `sqlite3` gem (pick one small app) | live or agent hosts | GET 200 |
   | Phoenix example | **need-pg** | same honesty bar |
   | Tiny Dockerfile HTTP app | live via SandboxDind | GET 200 |
   | Nested Vite+API needing Postgres | need-pg or build fail — never silent 200 | |

4. **Regression guards**  
   - After image bake: control Express still lives (tunnel).  
   - Sandbox instance ≥ **basic** while ruby/elixir baked (lite 256MiB OOMs → “Tunnel recovery attempts were exhausted”).  
   - DinD image has `/workspace`.  
   - `RUN_FAIL_CACHE_V` bump only when fail reason class changes.

## Arbitrary-code roadmap (sequence, not SKUs)

1. **Now — prove doors**  
   Language invent (Rails/Phoenix/Django/Express) + ensureRuntime + need-pg honesty + DinD one happy path.

2. **Corpus cadence**  
   Re-run table in §3 after every run-container image/worker deploy; append row to `qa/run-agent-corpus.md` (or this file’s “Results” below).

3. **Neon try-db** (within $1k amp)  
   Branch-per-try for need-pg stacks; still one-file / env only — no driver rewrite.

4. **Slim image**  
   Prefer ensureRuntime apt for rare stacks; keep bake for hot path so we can return toward `lite`/`basic` cost.

5. **Out of scope until proven**  
   Compose multi-container, Go/Rust invent (unless Dockerfile), Windows, private deps, GPU.

## Results — 2026-08-30

| Fixture | Job | Result |
| --- | --- | --- |
| Detect Rails / Docker | — | **ok** invent plans |
| heroku/ruby-getting-started | `run_a72c182d5dbe` | **need-pg** honest (`try-db=need-pg`) |
| docker/getting-started | `run_1a9596b1576e` | DinD `/workspace` ok; build failed (tutorial Dockerfile) — use smaller fixture |
| heroku/node-js-getting-started | `run_374811d35b8e` | **live** https://nodejs-getting-started-sage.aft.page |

### Incidents fixed this round

1. **lite → standard-1** — ruby/elixir bake OOMed tunnels on 256MiB.
2. **Fail-cache v9** — do not cache `Tunnel recovery` / clone-path / transient fails (v8 was the first bump for this class; v9 keeps `clone landed|unexpected path|tunnel recovery|could not get a public url` out of the cache).
3. **DinD `mkdir /workspace`** — musl dind base lacked it.
4. **`__aftDockerLive` on Sandbox Proxy** — ad-hoc prop read truthy → skipped language path (clone→Publishing→tunnel). Use local `dockerLive` boolean.

## Results — 2026-09-02 (re-check)

The 2026-08-30 round's *code* fixes are all on main and deployed (standard-1, fail-cache v9, DinD `/workspace`, local `dockerLive`, skip-first-invent when plan has install+start — verified in `run-container/src/deploy.ts` and `run-fail-cache.ts`). Live URLs from that round have since idled out (ephemeral sandbox `sleepAfter: 30m`): `nodejs-getting-started-sage` and `-sand` both return 502/530 on re-probe — same expected ephemeral behavior as the ops fixture; re-run the job to restore. The Rails `need-pg` honest-fail result (`run_a72c182d5dbe`, `try-db=need-pg`, not missing-start) is recorded and still the expected outcome until Neon.

## Decision — 2026-09-02

**Corpus round closed; do not continue the corpus until proof exists.** The "Next on the corpus" items (tiny Dockerfile happy path, Rails+sqlite3 live, Phoenix need-pg, Neon try-db) are **parked**. Rationale: 0/5 stranger trials recorded; todo.txt/p0.txt/stranger-trial.md all gate further Run/container spend behind proof. Neon is a paid build — not before a stranger reaches a URL. Re-open this file only when: (a) the fixture auto-restore exists and the canary stays green without manual re-runs, or (b) ≥1 stranger trial is recorded and the corpus is the blocker for trial #2. The one permitted follow-up is operational: auto-restore the Express fixture when it has been dead N consecutive probes.
