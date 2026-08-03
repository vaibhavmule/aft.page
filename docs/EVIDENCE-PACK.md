# Evidence pack (Week 4 / Phase 1 close)

Fill this for YC, investors, and yourself. North star:

> **Organisations with an application used weekly by at least two people.**

Deploy count alone does not count.

## Phase 1 success test (scripted demo)

Goal: an outsider completes this **without you operating their session**.

```text
1. Deploy (paste-html, MCP, or CLI) → live https://{slug}.aft.page
2. Claim from /preview (magic link) OR already own → /login
3. Open /inventory — site appears
4. From preview: set private, invite colleague by email
5. Colleague opens invite link, signs in, opens the app
6. Owner redeploys (PATCH / edit) and rolls back from preview or API
```

### Checklist

- [ ] Recorded once (screen + slug)
- [ ] Second person is **not** you / not a fake alt you control for the “external” bar
- [ ] Both can open the private URL while invited
- [ ] Redeploy or rollback done by owner without founder help

## Product proof links

| Item | URL / note |
| --- | --- |
| Login | https://aft.page/login |
| Inventory | https://aft.page/inventory |
| Paste (anonymous funnel) | https://aft.page/paste-html/ |
| Connector docs | [CONNECTOR.md](./CONNECTOR.md) |
| Pricing | [PRICING.md](./PRICING.md) |
| Expense dogfood (example) | deploy `examples/expense-approval/` |

## Customer evidence (fill weekly)

| Date | Who | Agent they use | App | Next step | Paid? |
| --- | --- | --- | --- | --- | --- |
| | | | | | |

Ask every call:

> “What useful internal tool did you create with an AI coding agent but fail to share or maintain properly?”

## Numbers (day 30 target)

| Metric | Target | Actual |
| --- | --- | --- |
| Outreaches (cum) | 120 | |
| Calls held | 20 | |
| Weekly active teams | ≥5 | |
| Orgs with 2+ users on one app | ≥1 | |
| Capability approvals (non-you) | ≥5 | |
| Connector demos (if asked) | ≥2 | |
| Paid / LOI / pilot (non-friend) | ≥1 | |
| YC app | submitted | |

## Screenshots / artifacts

- [ ] Inventory with ≥1 owned site
- [ ] Private invite accept
- [ ] Capability approve screen
- [ ] Connector live list (optional for pack; available if asked)
- [ ] Quote from a user (1–2 sentences)

## What not to chase for this pack

Deepening connector, BYOC, Workspace OIDC (defer unless &lt;2 days), marketing redesign.
