# Run agent corpus (fixed list)

Same four repos every run. Do not grow this into compat-probe.

Record: baseline (would this fail with detect-only / no agent?), automatic repair, false repair (rewrote pg/prisma to sqlite), wall time, model, cost.

Model ladder: `glm-4.7-flash` first, `glm-5.3-flash` only if empty/unparsed/throw. AI Gateway cost is not on the job row — note “unknown” unless the gateway log is copied.

## 2026-08-29

| Repo | Stack | Expected | Job | Wall | Model (from log) | Baseline | Auto-repair | False repair | Result |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| [heroku/node-js-getting-started](https://github.com/heroku/node-js-getting-started) | Express | HTTP 200, 0 or hosts-only | `run_0ae050b66742` | ~7.5 min (install ~5 min) | first pass note: “Express app binds process.env.PORT; nothing to change” (Flash path; no repair loop) | would 200 | n/a (no fail) | no | **live** https://nodejs-getting-started-rose-rose.aft.page GET 200 |
| [heroku/python-getting-started](https://github.com/heroku/python-getting-started) | Django | sqlite ORM switch ok | `run_319f7a6a5a03` | ~4 min | Flash notes: allow host/CSRF; sqlite fallback; then “default to SQLite when DATABASE_URL is missing” | install/migrate would miss `dj_database_url` | yes (2+ patch turns) — still failed | no (did not rewrite pg driver) | **failed** `ModuleNotFoundError: No module named 'dj_database_url'` after `manage.py migrate`. Agent did not `pip install dj-database-url`. |
| [mdn/django-locallibrary-tutorial](https://github.com/mdn/django-locallibrary-tutorial) | Django | sqlite file DB | `run_4584e5edb60a` | ~2 min | “Django LocalLibrary: switch to SQLite and allow the try host” | migrate would fail without sqlite/hosts | yes (first-pass patch; 0 repair-on-fail) | no (ORM engine switch, allowed) | **live** https://django-locallibrary-tutorial.aft.page/catalog/ GET 200 |
| [kartik-suryawanshi/Odoo_HRMS](https://github.com/kartik-suryawanshi/Odoo_HRMS) | nested Vite+Express, Postgres | honest fail (`need-pg`) | `run_a36d659ba33e` | ~9 min | none (died in UI build) | nested detect `root=backend` `frontendRoot=frontend` | no (never reached start) | no | **failed** Vite/Rolldown “chunks larger than 500 kB” as UI build fail. Never reached Postgres. |

## Notes

- Do not mark Express verified in FRAMEWORK-COMPATIBILITY from this fixture. T2U CLI list is a different bar. Ops fixture URL is the monitor.
- Peer-install helper printed a Python SyntaxError on the Express job (`python3 -c` + escaped newlines). Non-fatal; start still published. Do not expand the agent this round.
- Gateway $ not copied; Workers Observability + AI Gateway `default` is the source if we need $ later.
