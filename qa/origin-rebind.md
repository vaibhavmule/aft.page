# Origin rebind — live proof (2026-08-29)

Stable product URL stays put when the Quick Tunnel dies. Same hostname recovers.

## Fixture

| Field | Value |
| --- | --- |
| Repo | `heroku/node-js-getting-started` |
| Job | `run_0ae050b66742` |
| Public URL | https://nodejs-getting-started-rose-rose.aft.page/ |
| Sandbox id | `run-run-0ae050b66742` |

## Sequence

1. `GET` public URL → **HTTP 200**, `x-aft-slug: nodejs-getting-started-rose-rose`, upstream `https://butterfly-now-exactly-tall.trycloudflare.com`
2. Expire origin: `POST https://run-container.aft.page/v1/rebind` `{ sandbox_id, port: 8080 }` → minted `https://defining-cooked-charles-seminar.trycloudflare.com`
3. Old origin `butterfly-now-exactly-tall.trycloudflare.com` → **HTTP 530**
4. First `GET` on the same public hostname → **HTTP 530** (~22s) while tunnel DNS catches up; `x-aft-slug` unchanged
5. Next `GET` https://nodejs-getting-started-rose-rose.aft.page/ → **HTTP 200**, body `Node.js Getting Started on Heroku`, upstream `https://medicaid-minimize-hoping-deborah.trycloudflare.com` (not the expired host)

Public hostname did not change. Serve rebind + 12s 530 wait is enough for the second GET; first GET can still 530.
