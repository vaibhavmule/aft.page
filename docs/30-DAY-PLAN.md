# aft.page — 30-day plan

Internal. Goal: prove **A Cloud for Small Software** with real users in 30 days.

Updated: 2026-08-06

Sam frame:

> Seven minutes → app. Seven days → product. Seven weeks → customer evidence. Seven months → company.

**Static technical proof is done.** Connector v0 is an enabling prototype—freeze
deepening until a useful app demands it. The next product proof is repeat usage,
Doc-simple sharing, and one full-stack runtime without cloud ceremony.

Mission: **agent output → durable app → share like a Google Doc.** Useful solo
apps and small-team apps both count; one-shot deploys do not.

Time split: ~50% product / ~40% customers / ~10% writing. After login ships, customers ≥ engineering.

---

## 30-day outcome (non-negotiable)

By day 30:

| Must have | Stretch |
| --- | --- |
| YC application submitted | YC interview invite |
| Polymerize IP reviewed (personal hardware only) | — |
| Ownership + basic share working | Workspace/Entra domain login |
| Capability approve-on-deploy visible (even ugly) | Connector v0 (outbound) on one dogfood app |
| **≥5 repeat deployers** and ≥3 apps used after 7 days | **≥1 full-stack/OpenNext app** without manual cloud setup |
| **≥3 design-partner conversations** with a clear next step | **≥1 paying** or signed LOI / pilot letter |

**User definition (be honest):** a person or small team that deploys more than
once, returns to the app, or would notice if aft disappeared. Anonymous one-shot
HTML is activation—not retained usage.

Paid can wait until week 3–4; **weekly usage cannot.**

---

## Positioning (say this every outreach)

> Your agent made the software. aft makes it live, persistent, and shareable.

> A cloud for purpose-built software used by one person or a small handful—no
> repository or cloud ceremony required.

The URL is the first success. The company is the simplest durable runtime and
lifecycle for Small Software. Identity, capabilities, and connectors serve it.

---

## Calendar (30 days from 2026-08-03 → 2026-09-02)

### Week 1 (days 1–7) — Unlock + talk

**Product (agent-speed)**
- [ ] Ship users / ownership / sessions (magic link first)
- [ ] Private + invite (good enough, not perfect)
- [ ] Submit **YC late application** + 1-min video ([YC-APPLICATION.md](./YC-APPLICATION.md))
- [ ] Read Polymerize employment agreement (IP / moonlighting)

**Customers (human-speed — this is the bottleneck)**
- [ ] List **50** targets: people already making personal or team apps with Claude, Codex, Cursor, ChatGPT, Lovable, Replit, or v0
- [ ] Send **30** outreaches (short: “What did your agent build that never made it past localhost?”)
- [ ] Book **5** calls
- [ ] Dogfood one real personal or team app daily (force runtime + lifecycle pain)

**Exit week 1:** App in. IP read. ≥5 calls booked. Auth path live or days away.

### Week 2 (days 8–14) — Differentiator visible + first yeses

**Product**
- [x] Immutable deploy versions + **project list** (owner, version, last-used)
- [x] `aft.json` `capabilities` + deploy prints requests → approve/deny (v1: secrets + egress allowlist OK)
- [x] Expense/refund (or similar) dogfood app that *asks* for capabilities

**Customers**
- [ ] Run the 5+ calls; ask for **deploy this week**
- [ ] Send **30** more outreaches
- [ ] Convert **≥3 people or teams** to repeat deployers
- [ ] Start a shared “design partner” Notion/Sheet: name, agent they use, app, next step

**Exit week 2:** ≥3 repeat deployers; at least one app shared or used after seven days.

### Week 3 (days 15–21) — Connector story + paid path

**Product**
- [x] Connector agent v0: one outbound binary/container; one declared capability enforced (e.g. read one table or hit one internal URL)
- [x] Dogfood app pulls **live data through connector** (Sites can’t match this demo)
- [x] Ugly paid offer: team plan / private apps / connector pilot price written down

**Customers**
- [ ] **10** live demos (capability + connector if ready)
- [ ] Push for **design partner MoU** or paid pilot ($99–500/mo or $2–5k pilot — pick one and stick)
- [ ] Ask every user: “Will you use this again next week, and who would you share it with?”

**Exit week 3:** Connector demoable once. ≥1 serious pilot conversation in writing.

### Week 4 (days 22–30) — Phase 1 close + evidence pack

**Product**
- [x] Magic-link login → inventory (Phase 1 success-test unblocker)
- [x] Inventory UX: login CTA, site actions, paste / preview links
- [x] Evidence pack + Phase 1 success-test runbook ([EVIDENCE-PACK.md](./EVIDENCE-PACK.md))
- [ ] **No** full BYOC / residency / SBOM theatre
- [ ] **No** connector deepen (v0 already demoable)

**Customers**
- [ ] Hit **≥5 repeat deployers** (stretch: 10 retained apps)
- [ ] ≥1 app shared with and used by another person
- [ ] Close **≥1** paid or signed pilot / LOI (non-friend; ₹ or $ per [PRICING.md](./PRICING.md))
- [ ] Evidence pack filled: screenshots, deploy counts, quotes, demo link

**Exit day 30:** repeat-use evidence + at least one commercial yes (or dated
written intent). Days 31–60 = improve the runtime people actually need; deepen
connector or enterprise features only on demand.

---

## Daily rhythm (non-negotiable)

| Block | Time | Job |
| --- | --- | --- |
| Build | 60–90 min | One shippable Small Software slice (activation, sharing, runtime) |
| Outreach | **60 min** | 5–10 messages / follow-ups — every day |
| Users | 30–60 min | Calls, demos, unblock a team |
| Dogfood | 15 min | Deploy or use aft yourself |

If build > outreach two days in a row, you are failing the 30-day goal.

Agents may compress build to “seven minutes.” **They cannot send your 30 messages.**

---

## Who to sell first (fastest path)

1. **People already using Claude Code / Cursor / Codex** who make useful personal software
2. **Small teams** with agent-generated prototypes stuck on localhost or in chat
3. **One security-minded champion** when sharing or live data becomes the blocker

Avoid six-month enterprise procurement as a week-1 motion. Sell the simplest
hosted path first; discuss BYOC or connectors only when a real app requires them.

---

## Phases (Sam + compressed 30 days)

```text
Phase 0      Technical proof      DONE — agent → URL (do not rebuild)
Phase 1      Durable ownership    login, projects, updates, rollback
Phase 2      External-user proof  stranger deploys, repeat use, first share
Phase 3      Runtime expansion    one full-stack app without cloud setup
Phase 4      First paid           retained apps, private sharing, runtime limits
Months 4–7   Company              GTM hire, retention, clear buyer
Months 8–18  Scale proven part    BYOC only on signed demand
```

Polymerize: **do not resign** in the first seven-week proof.

---

## Explicitly do *not* do in these 30 days

- Full BYOC data plane / multi-region residency
- Perfect design system / Ona-clone marketing rebuild (unless it unblocks demos)
- Waiting for YC reply before talking to users
- Building features nobody asked for on a call
- Treating one-shot anonymous deploys as “customers”

---

## Scoreboard (check every Sunday)

| Metric | Day 7 | Day 14 | Day 21 | Day 30 |
| --- | --- | --- | --- | --- |
| Outreaches sent (cum) | 30 | 60 | 90 | 120 |
| Calls held | 3 | 8 | 15 | 20 |
| Repeat deployers | 1 | 3 | 5 | 5–10 |
| Apps used after 7 days | 0 | 1 | 2 | 3+ |
| Apps shared with another person | 0 | 1 | 2 | 3+ |
| Paid / LOI / pilot | 0 | 0 | 0–1 | ≥1 |
| YC app | done | — | — | — |

---

## Related

- [STRATEGY.md](./STRATEGY.md) — north star, sequencing buckets, competitive map  
- [YC-APPLICATION.md](./YC-APPLICATION.md) — paste into apply form  
- [BRAND.md](./BRAND.md) — craft bar (Ona-grade), not this month’s blocker  
- [CONNECTOR.md](./CONNECTOR.md) — Week 3 connector protocol + demo  
- [PRICING.md](./PRICING.md) — Free / Team $99 or ₹9,999 / connector pilot  
- [EVIDENCE-PACK.md](./EVIDENCE-PACK.md) — Week 4 close checklist + Phase 1 success test  

**Rule:** Ship with agents. Watch what strangers keep and share.
