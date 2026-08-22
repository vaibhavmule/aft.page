# Evidence pack (Week 4 / Phase 1 close)

Fill this for YC, investors, and yourself. Mission:

> **Make Small Software as easy to deploy and share as a Google Doc.**

Evidence includes useful solo software and shared team software. Deploy count
alone does not count; repeat use does.

## Phase 1 success test (scripted demo)

Goal: an outsider completes this **without you operating their session** and
returns to the resulting application later.

```text
1. Deploy (drop, MCP, or CLI) → live URL
2. Claim on the live slug URL (magic link) OR already own → /login
3. Open /projects — site appears
4. From /project: set private, invite colleague by email
5. Colleague opens invite link, signs in, opens the app
6. Owner redeploys (PATCH / edit) and rolls back from /project or API
```

### Hosted CLI outsider (required path)

Founder does **not** operate their session or hint around failures.
Machine T2U on ops is a different clock — stopwatch **human T2U**
([time-to-url.txt](../time-to-url.txt)): install → they can open the URL.

```text
1. curl -fsSL https://aft.page/install | sh
2. aft deploy [dir] → live URL (start stopwatch at install; stop when URL loads)
3. Claim on the live slug URL
4. Update (aft deploy again or Drop) — same URL
5. Set private, invite second person by email
6. Second person opens invite, signs in, opens the app
```

Log every failure (PATH, Node version, claim mail, invite, second-person auth)
in the table below. `qa/time-to-url/` is not a substitute.

| Clock | Value | Notes |
| --- | --- | --- |
| Human T2U (install → working URL) | _not run_ | Needs a stranger, not founder |
| Failures (unhelped) | _none recorded_ | |

Gate after this: the app is used the next week by both people. Until then, no
new runtime surface.

### Checklist

- [ ] Recorded once (screen + slug)
- [ ] Builder is **not** you / not a fake account you control
- [ ] Builder returns to the app or redeploys within seven days
- [ ] Both can open the private URL while invited
- [ ] Redeploy or rollback done by owner without founder help

### Sign in with AFT — two-person run (2026-08-22)

Demo app: **https://three-things.aft.page** (`examples/three-things/`). Shipped on
`agent/release-hardening` (commits `c154d8a`–`c9dad63` + migration `0cf6a11`).

| Step | Owner | Second person | Status |
| --- | --- | --- | --- |
| 1 | Open demo → **Sign in with AFT** → magic link | — | Prod OK: `/_aft/me` → `user:null`; `/signin-with-aft` → `/login?next=` |
| 2 | Claim slug (if unclaimed) or use `/projects` | — | `three-things` deployed; claim not verified live |
| 3 | `/project` → **private** → invite colleague email | — | Not run live |
| 4 | — | Accept invite email → sign in → open app | Not run live |
| 5 | Both call `/_aft/me` on private slug → see own email | Both see app content | **Blocked — needs two humans + inbox** |
| 6 | Owner redeploys; both still reach app | — | Loop test passes in CI; not live on demo |

Automated substitute (founder session only): `apps/api/test/loop.test.ts` +
`serve.test.ts` identity cases — **324/324 API tests green** (2026-08-22).

**Decisive gap unchanged:** another person deploys (or is invited), signs in via
Sign in with AFT, and uses the app without founder help.

## Product proof links

| Item | URL / note |
| --- | --- |
| Login | https://aft.page/login |
| Projects | https://aft.page/projects |
| Drop (anonymous activation) | https://aft.page/drop/ |
| Connector docs | [CONNECTOR.md](./CONNECTOR.md) |
| Pricing | [PRICING.md](./PRICING.md) |
| Expense dogfood (example) | deploy `examples/expense-approval/` |
| Enterprise license dogfood | https://enterprise-license.aft.page — MCP deploy 2026-08-08 (founder, not a stranger) |

## Founder loop (2026-08-08)

Scripted: `apps/api/test/loop.test.ts` — deploy → claim → private → invite view+edit → redeploy → rollback. Passes in CI/local.

Live (founder, counts as dogfood not stranger evidence):

| Step | Result |
| --- | --- |
| MCP `aft_health` | `ok=true via=service-binding` |
| MCP `deploy_html` → URL | https://enterprise-license.aft.page (~2s) |
| Redeploy + rollback via editToken | ok (`dep_152fffaf71c6` → rolled back to `dep_499a1118d375`) |
| Claim + private + invite | claim mail sent to hello@aft.page — finish from inbox, then private + invite a second human |
| Status MCP probe | https://status.aft.page/ — MCP operational via Worker binding |

Time-to-URL (agent MCP call → live HTTPS): **~2 seconds**.

**Seven-day return (due 2026-08-15):** **No.** No recorded revisit, redeploy, or
private+invite completion on enterprise-license. Anonymous probe 2026-08-22 still
shows public site only (`/_aft/me` → `user: null`). Claim inbox step was never
finished in the evidence log.

## Release sync (2026-08-22)

| Item | State |
| --- | --- |
| API tests | 324/324 green (migration `0027` + changelog test aligned) |
| Git | `origin/agent/release-hardening` @ `0cf6a11` — identity + login fixes + `0027` pushed |
| Main | Still at pre-identity merge (`fdc115d`); prod is ahead of `main` |
| WIP split | `agent/www-reprise` — homepage/auth-nav polish, not in release |
| Sign in with AFT demo | https://three-things.aft.page live |

## Customer evidence (fill weekly)

| Date | Who | Agent they use | App | Next step | Paid? |
| --- | --- | --- | --- | --- | --- |
| 2026-08-08 | founder (hello@aft.page) | remote MCP | [enterprise-license](https://enterprise-license.aft.page) | claim never finished; **no 7-day return** (checked 2026-08-22) | no |
| 2026-08-19 | founder | — | [three-things](https://three-things.aft.page) | Sign in with AFT demo live; **two-person invite not run** | no |

Ask every call:

> “What useful personal or team software did an AI agent create that you could
> not easily deploy, keep running, or share?”

## Numbers (day 30 target)

| Metric | Target | Actual |
| --- | --- | --- |
| Outreaches (cum) | 120 | |
| Calls held | 20 | |
| Stranger deployments reaching a URL | ≥10 | |
| Repeat deployers | ≥5 | |
| Apps still used after 7 days | ≥3 | |
| Apps shared with another person | ≥1 | |
| Full-stack app without manual cloud setup | ≥1 | |
| Capability approvals (non-you) | ≥5 | |
| Connector demos (if asked) | ≥2 | |
| Paid / LOI / pilot (non-friend) | ≥1 | |
| YC app | submitted 18 Aug 2026, In review | |

## Screenshots / artifacts

- [ ] Projects with ≥1 owned site
- [ ] Private invite accept
- [ ] Capability approve screen
- [ ] Connector live list (optional for pack; available if asked)
- [ ] Quote from a user (1–2 sentences)

## What not to chase for this pack

Deepening connector, BYOC, Workspace OIDC (defer unless &lt;2 days), marketing redesign.
