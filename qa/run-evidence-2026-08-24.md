# Run evidence — 2026-08-24 (updated 2026-08-26)

Paste-repo path via `POST https://api.aft.page/v1/repo/deploy` (same as https://aft.page/run/).

## A. Vite success (2026-08-26)

| Field | Value |
| --- | --- |
| Repo | `mdn/todo-react` |
| Detection | `static_build` / Vite (branch `main`) |
| 2026-08-24 job | `run_fce84089f050` — `runner_unavailable` (GHA **403**, token) |
| 2026-08-26 first retry | `runner_unavailable` (GHA **404**, `run-static-build.yml` not on `main` yet) |
| Working job | `run_0efab2257d65` |
| Working URL | https://moz-todo-react-sage.aft.page |
| Failure logs | none |
| Second person | **yes** — anonymous GET 200; added a todo in the browser (“Run on AFT”, 4 tasks remaining) |

Note: this repo’s Vite `base` points at `mdn.github.io/todo-react`, so JS/CSS load from GitHub Pages. The AFT URL serves the built `index.html` and the app is interactive.

Open: https://aft.page/run/mdn/todo-react

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

## C. Express container success (2026-08-26, restored 2026-08-29)

| Field | Value |
| --- | --- |
| Repo | `heroku/node-js-getting-started` |
| Detection | `container` / Express (`npm start`, port 8080) |
| Job (2026-08-26) | `run_fdaf6677d10d` |
| Working URL (2026-08-26) | https://nodejs-getting-started-sky.aft.page (origin dead 2026-08-29; 530/502, sandbox gone) |
| Job (2026-08-29 restore) | `run_0ae050b66742` |
| Working URL (ops fixture) | https://nodejs-getting-started-rose-rose.aft.page |
| Failure logs | npm EBADENGINE warning; peer-install python one-liner SyntaxError (non-fatal); start still published |
| Second person | **yes** — anonymous GET 200 (home) |
| Origin rebind | [origin-rebind.md](./origin-rebind.md) — same hostname recovered after deliberate tunnel expire |

Open: https://aft.page/run/heroku/node-js-getting-started

## Known misses (2026-08-26)

### Kartik `Odoo_HRMS` — split app, no root detect

https://aft.page/run/kartik-suryawanshi/Odoo_HRMS — `no_index` at repo root (`frontend/` Vite + `backend/` Express + Postgres). UI can pick a folder. Frontend-only is a login SPA that still needs the API. Use a root-level Kartik repo instead: [Portfolio](https://aft.page/run/kartik-suryawanshi/Portfolio) (Vite) or [Buget_Tracker](https://aft.page/run/kartik-suryawanshi/Buget_Tracker) (static).

### Rohit Django — pip missing in sandbox

`Django-CRM-mastery-app-Project` and `QuickMart-MarketPlace-app` detect as `container` / Django, then `pip: command not found`. Fix: `python3 -m pip` + pip in the runner image.
