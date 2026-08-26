# Run evidence — 2026-08-24 (updated 2026-08-26)

Paste-repo path via `POST https://api.aft.page/v1/repo/deploy` (same as https://aft.page/run/).

## A. Vite (still blocked — workflow not on origin)

| Field | Value |
| --- | --- |
| Repo | `mdn/todo-react` |
| Detection | `static_build` / Vite (branch `main`) |
| 2026-08-24 job | `run_fce84089f050` |
| 2026-08-24 error | `runner_unavailable` — GHA workflow_dispatch **403** (token missing `actions: write`) |
| 2026-08-26 retry | `runner_unavailable` — GHA workflow_dispatch **404** (`run-static-build.yml` not on `main`) |
| Working URL | none |

Live API now dispatches `run-static-build.yml`. Origin still only has `run-vite.yml`. Token 403 is no longer the blocker. Re-run after that workflow file is on `main`.

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

## C. Express container success (2026-08-26)

| Field | Value |
| --- | --- |
| Repo | `heroku/node-js-getting-started` |
| Detection | `container` / Express (`npm start`, port 8080) |
| Job | `run_fdaf6677d10d` |
| Working URL | https://nodejs-getting-started-sky.aft.page |
| Failure logs | none |
| Second person | **yes** — anonymous GET 200 (home + in-app nav to How Heroku Works) |

Open: https://aft.page/run/heroku/node-js-getting-started
