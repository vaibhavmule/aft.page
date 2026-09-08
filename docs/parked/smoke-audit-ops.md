# Parked: smoke, audit, Worker ops SSR, macOS Drop

Retired 8 Sep 2026 from `aft-page-api` / product tree.

- Smoke + audit cron (`0 4,16`) and fixture users (`test@aft.page`, …)
- Founder ops HTML hub (`apps/api/src/ops/`) — host `ops.aft.page` returns 410
- Compat probe GH Action + `qa/compat-probe/`
- `apps/macos/` + `macos-release.yml`

**Kept:** customer Run Actions (`run-vite` / `run-next` / `run-static-build`), MCP deploy, share, status probes.

Do not re-monolith founder tooling into the API Worker. Scoreboard = D1 + status.aft.page.
