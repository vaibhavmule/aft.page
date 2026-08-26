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
