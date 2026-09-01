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

Time-to-URL (agent MCP call → live HTTPS): **~2 seconds**. Seven-day return: not yet due.

## Customer evidence (fill weekly)

| Date | Who | Agent they use | App | Next step | Paid? |
| --- | --- | --- | --- | --- | --- |
| 2026-08-08 | founder (hello@aft.page) | remote MCP | [enterprise-license](https://enterprise-license.aft.page) | claim → private → invite one teammate; check return 2026-08-15 | no |

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
| YC app | Fall 2026 rejected 29 Aug (no interview). Next on-time 2 Nov | |

## Screenshots / artifacts

- [ ] Projects with ≥1 owned site
- [ ] Private invite accept
- [ ] Capability approve screen
- [ ] Connector live list (optional for pack; available if asked)
- [ ] Quote from a user (1–2 sentences)

## What not to chase for this pack

Deepening connector, BYOC, Workspace OIDC (defer unless &lt;2 days), marketing redesign.
