# Compat probe

Internal QA. Not a product. No Cloudflare Agents / Sandbox.

Once a day (or on demand) pick random public GitHub framework repos, clone, `npm run build`, `aft deploy`, write the live URL or a fail reason.

```sh
cd aft.page
node qa/compat-probe/check.mjs
node qa/compat-probe/run.mjs                  # 5 repos
node qa/compat-probe/run.mjs --count 3
node qa/compat-probe/run.mjs --repo vitejs/vite-plugin-react   # one-off
```

Uses the hosted CLI in this repo (`apps/cli`). `GITHUB_TOKEN` is optional and only used to search public repositories. `AFT_PROBE_TOKEN` is required for deploy and cleanup; it must be an aft.page bearer token for the dedicated probe owner. Untrusted repositories never receive either token.

## Results

Printed as a table. Also appended to:

- `qa/compat-probe/logs/YYYY-MM-DD.json`
- `qa/compat-probe/logs/latest.json`

`ok: false` is expected often (SSR Next, monorepo, missing env, >500 files). Read `reason` and check later. Target is **5 attempts/day**, not 5 greens.

Slugs: `test--fw-1` … `test--fw-5` (`https://test--fw-1.aft.page`). Metrics ignore `test--*`. Each probe is deleted after its serve check, including failed checks after deployment.

## Daily cron

GitHub Action `.github/workflows/compat-probe.yml` — `0 12 * * *` UTC + workflow_dispatch. Configure the repository secret `AFT_PROBE_TOKEN` before enabling it. Uploads the log as an artifact. Does not fail the job when probes skip/fail.

## Out of scope

SSR / OpenNext, monorepos, dummy `.env`, marking frameworks “verified” in FRAMEWORK-COMPATIBILITY.md. T2U fixtures still gate “supported”.
