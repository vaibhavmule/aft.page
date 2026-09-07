# Evidence pack (Week 4 / Phase 1 close)

Updated: 2026-09-06 — first external users (see § Ops snapshot).

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

## Ops snapshot — 2026-09-06 (day 34)

First real outside signal. Read [ops.aft.page](https://ops.aft.page/users?filter=external)
for the live version; this is the dated copy.

| Count | Value | What it means |
| --- | --- | --- |
| Sites | **362** | D1 `sites` minus `test--%`. Includes unclaimed anonymous drops. |
| Users | **34** | 17 internal (`OPS_EMAILS` / `@aft.page` / plus-aliases) + **17 external** |
| Sites claimed by external users | **59** | Sum of the Sites column on ops → Users → External |
| External accounts holding ≥2 claimed sites | **6** | 31 · 6 · 4 · 3 · 3 · 2 |
| Custom domains | 3 | Founder dogfood. Zero external `requested`. |
| Waitlist | 2 | Both founder addresses. Homepage capture converts nothing. |
| Feedback rows | 1 | |

External accounts, first → latest: **2026-08-12 → 2026-09-05**. Fourteen of the
seventeen arrived in the last nine days (Aug 28 – Sep 5), so the curve is
bending up, not flat. Nobody was sent by an outreach message — this is inbound.

Country spread in the emails (`.at`, `qq.com`, Indian and South Asian gmails)
matches [REGIONS.md](./REGIONS.md): the demand is not US-first.

### What this is, honestly

An account exists only after a magic-link claim on a live URL, so each external
row means: a stranger deployed something, got a URL, and chose to own it —
without the founder in the session. That is **activation**, and it is the first
time this file has had a number in it.

It is **not** retention, sharing, or revenue:

- No idea what any of them built, or whether they came back.
- One account holds **31** sites. Read that before counting it as one happy user
  — it could be an agent loop.
- Several addresses look throwaway (`dsddsd981@`, `ppppppppprrrr…@`).
- One external account (`mdsakib22ww@`) has **0** sites — signed up, deployed nothing.
- Zero invite accepts by a second human. Zero paid. One feedback row.

### Next (do these before writing any new claim)

1. Sort external sites by `last_served_at` / views 7d — who actually came back.
2. Look at what `platinum303030@` (31 sites) and `609860565@qq.com` (6 sites) built.
3. Email all 17. One question: *what did you deploy, and did you send it to anyone?*
4. Only then fill the stranger-trial rows in [../qa/stranger-trial.md](../qa/stranger-trial.md)
   — that scoreboard wants named, observed trials, and inbound accounts do not
   substitute for it.

## Customer evidence (fill weekly)

| Date | Who | Agent they use | App | Next step | Paid? |
| --- | --- | --- | --- | --- | --- |
| 2026-08-08 | founder (hello@aft.page) | remote MCP | [enterprise-license](https://enterprise-license.aft.page) | claim → private → invite one teammate; check return 2026-08-15 | no |
| 2026-08-12 → 09-05 | 17 external accounts (inbound, unknown) | unknown | 59 claimed sites | email all 17; ask what they built and who they sent it to | no |

Ask every call:

> “What useful personal or team software did an AI agent create that you could
> not easily deploy, keep running, or share?”

## Numbers (day 30 target)

Actual = ops, **2026-09-06** (day 34 of a window that closed 2026-09-02).

| Metric | Target | Actual |
| --- | --- | --- |
| Outreaches (cum) | 120 | **0** — none sent; every external account is inbound |
| Calls held | 20 | **0** |
| Stranger deployments reaching a URL | ≥10 | **≥17** — external accounts, each claimed on a live URL (16 with ≥1 site) |
| Repeat deployers | ≥5 | **6** external accounts hold ≥2 claimed sites (not yet checked for return visits) |
| Apps still used after 7 days | ≥3 | **unknown** — sort external sites by `last_served_at` / views 7d |
| Apps shared with another person | ≥1 | **0** invite accepts |
| Full-stack app without manual cloud setup | ≥1 | **yes** — [next-hello](https://next-hello.aft.page) (founder), Run Express fixture |
| Capability approvals (non-you) | ≥5 | **0** |
| Connector demos (if asked) | ≥2 | **0** |
| Paid / LOI / pilot (non-friend) | ≥1 | **0** |
| YC app | Fall 2026 rejected 29 Aug (no interview). Next on-time 2 Nov | file now has activation numbers; retention still missing |

Two lines carry the whole quarter: **outreach 0** and **shared with another
person 0**. Strangers found the product without help; nothing yet proves they
keep the app or hand it to anyone.

## Screenshots / artifacts

- [ ] Projects with ≥1 owned site
- [ ] Private invite accept
- [ ] Capability approve screen
- [ ] Connector live list (optional for pack; available if asked)
- [ ] Quote from a user (1–2 sentences)

## What not to chase for this pack

Deepening connector, BYOC, Workspace OIDC (defer unless &lt;2 days), marketing redesign.
