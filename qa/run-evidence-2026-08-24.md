# Run evidence — 2026-08-24

Paste-repo path via `POST https://api.aft.page/v1/repo/deploy` (same as https://aft.page/run/).

## A. Vite attempt (failed — runner)

| Field | Value |
| --- | --- |
| Repo | `mdn/todo-react` |
| Detection | `vite` (branch `main`) |
| Job | `run_fce84089f050` |
| Queue/build time | ~1.4s until fail (no build) |
| Working URL | none |
| Error | `runner_unavailable` |
| Reason | GitHub Actions workflow_dispatch **403**: `Resource not accessible by personal access token` |
| Second person | n/a |

**Unblock:** `AFT_RUN_GITHUB_TOKEN` on `aft-page-api` needs `actions: write` (and contents read) on `vaibhavmule/aft.page` so `run-vite.yml` / `run-next.yml` can be dispatched. Then re-run a Vite repo.

## B. Static success (complete Run path)

| Field | Value |
| --- | --- |
| Repo | `mdn/beginner-html-site-scripted` |
| Detection | `static` (branch `main`, 1241 bytes) |
| Job | `run_d6f0a7bbedb8` |
| Queue/build time | **~4s** wall (sync deploy, no GHA) |
| Working URL | https://my-test-page-coral.aft.page |
| Failure logs | none |
| Second person | **yes** — anonymous GET 200; `/_aft/me` → `{"user":null}`; fresh UA also 200 (public site) |

Open: https://aft.page/run/mdn/beginner-html-site-scripted
