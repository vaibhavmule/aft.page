# aft.page — 30-day plan

Internal. Goal: prove **A Cloud for Small Software** with real users in 30 days.

Updated: 2026-08-11

**Freeze in force (2026-08-11 → 2026-09-10):** no new product lines. See
[STRATEGY.md](./STRATEGY.md) § 30-day freeze and [`../todo.txt`](../todo.txt).
This window is distribution + proof only.

Sam frame:

> Seven minutes → app. Seven days → product. Seven weeks → customer evidence. Seven months → company.

**Static Drop-class deploy is done and commoditized by Cloudflare Drop.** Connector v0
stays demoable. **Proof and platform run in parallel:** repeat usage + Doc-simple
sharing *and* full-stack orchestration (OpenNext via CF adapter).

Mission: **agent output → durable app → share like a Google Doc.** Useful solo
apps and small-team apps both count; one-shot deploys do not.

Time split: ~40% platform (runtimes + sharing) / ~40% customers / ~20% writing.
Neither track may starve the other for a full week.

Lifecycle above CF primitives — see [ADR-TEMP-ACCOUNTS.md](./ADR-TEMP-ACCOUNTS.md),
[OPENNEXT-ORCHESTRATION.md](./OPENNEXT-ORCHESTRATION.md).

---

## 30-day outcome (non-negotiable)

By day 30:

| Must have | Stretch |
| --- | --- |
| YC application submitted | YC interview invite |
| Polymerize IP reviewed (personal hardware only) | — |
| Ownership + basic share working | Workspace/Entra domain login |
| Capability approve-on-deploy visible (even ugly) | Connector deepen beyond v0 |
| **≥5 repeat deployers** and ≥3 apps used after 7 days | **≥1 paying** or signed LOI / pilot letter |
| **≥3 design-partner conversations** with a clear next step | Custom domains / editable preview |
| **≥1 full-stack app** without manual cloud setup (OpenNext / worker counts) | Claude marketplace listing |

**User definition (be honest):** a person or small team that deploys more than
once, returns to the app, or would notice if aft disappeared. Anonymous one-shot
HTML is activation—not retained usage.

Paid can wait until week 3–4; **weekly usage cannot.**

---

## Positioning (say this every outreach)

> AFT is the publishing and permission layer for software created by AI agents.

> Your agent made the software. aft makes it live, persistent, and shareable.

> A cloud for purpose-built software used by one person or a small handful—no
> repository or cloud ceremony required.

The URL is the first success. The company is the simplest durable runtime and
lifecycle for Small Software. Identity, sharing, secrets, and connectors serve it —
not “we host HTML” (Cloudflare already commoditizes that).

**Highest-priority distribution (Aug 2026):** [Agent Plugins](https://vercel.com/blog/introducing-agent-plugins)
(skill + MCP) so “Deploy with AFT” works in Cursor (and later other agents). See
[STRATEGY.md](./STRATEGY.md).

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

### Week 3 (days 15–21) — Runtime + paid path

**Product (platform track)**
- [x] Connector agent v0: one outbound binary/container; one declared capability enforced (e.g. read one table or hit one internal URL)
- [x] Dogfood app pulls **live data through connector** (Sites can’t match this demo)
- [x] Ugly paid offer: team plan / private apps / connector pilot price written down
- [x] OpenNext dogfood via `@opennextjs/cloudflare` + aft upstream — https://next-hello.aft.page

**Customers (proof track)**
- [ ] **10** live demos (capability + connector if ready; full-stack if ready)
- [ ] Push for **design partner MoU** or paid pilot ($99–500/mo or $2–5k pilot — pick one and stick)
- [ ] Ask every user: “Will you use this again next week, and who would you share it with?”

**Exit week 3:** Connector demoable once. Full-stack path demoable (next-hello). ≥1 serious pilot conversation in writing.

### Week 4 (days 22–30) — Phase 1 close + dual-track evidence

**Product (platform track)**
- [x] Magic-link login → inventory (Phase 1 success-test unblocker)
- [x] Inventory UX: login CTA, site actions, paste / preview links
- [x] Evidence pack + Phase 1 success-test runbook ([EVIDENCE-PACK.md](./EVIDENCE-PACK.md))
- [x] Full-stack dogfood live: OpenNext — https://next-hello.aft.page
- [~] **Agent Plugin (P0):** package scaffold in-repo; per-IDE / marketplace listings **pending**. MCP ready today.
- [ ] Push plugin tree + 30-second demo clip for outreach
- [ ] Optional later: AFT GitHub org / cursor.directory listing — not required for install
- [ ] Analytics coverage: deploy, open, share, redeploy ([METRICS.md](./METRICS.md))
- [x] OpenNext on aft URL (stretch) — https://next-hello.aft.page — [OPENNEXT-ORCHESTRATION.md](./OPENNEXT-ORCHESTRATION.md)
- [ ] **No** full BYOC / residency / SBOM theatre
- [ ] **No** connector deepen unless a design partner’s app requires it
- [ ] **No** Kitesurf / browser-automation work (defer until an app needs it)

**Customers (proof track)**
- [ ] Hit **≥5 repeat deployers** (stretch: 10 retained apps)
- [ ] ≥1 app shared with and used by another person
- [ ] Close **≥1** paid or signed pilot / LOI (non-friend; ₹ or $ per [PRICING.md](./PRICING.md))
- [ ] Evidence pack filled: screenshots, deploy counts, quotes, demo link

**Exit day 30:** repeat-use evidence + full-stack runtime proof (next-hello) + at least one
commercial yes (or dated written intent). Days 31–60 deepen what design partners
actually need (domains, SSO, connector, OpenNext) — still dual-track with outreach.

---

## Daily rhythm (non-negotiable)

| Block | Time | Job |
| --- | --- | --- |
| Build | 60–90 min | Platform slice (sharing polish, OpenNext when needed, distribution) |
| Outreach | **60 min** | 5–10 messages / follow-ups — every day |
| Users | 30–60 min | Calls, demos, unblock a team |
| Dogfood | 15 min | Deploy or use aft yourself (prefer full-stack when path exists) |

If build > outreach two days in a row **or** outreach with zero platform progress
for a full week, you are failing the dual-track plan.

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
Phase 2∥3    Proof ∥ runtime      stranger deploys + repeat use + share
                                  AND one full-stack app without cloud setup
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
- Building features nobody asked for on a call (except agreed runtime track: OpenNext on demand)
- Treating one-shot anonymous deploys as “customers”
- Running proof-only or platform-only for a full week
- Competing on static hosting alone (Drop / Dynamic Workers already win that race)
- Building around Kitesurf or agent browsers before a real app needs automation

---

## Scoreboard (check every Sunday)

| Metric | Day 7 | Day 14 | Day 21 | Day 30 |
| --- | --- | --- | --- | --- |
| Outreaches sent (cum) | 30 | 60 | 90 | 120 |
| Calls held | 3 | 8 | 15 | 20 |
| Repeat deployers | 1 | 3 | 5 | 5–10 |
| Apps used after 7 days | 0 | 1 | 2 | 3+ |
| Apps shared with another person | 0 | 1 | 2 | 3+ |
| Full-stack dogfood (Next / worker) | next-hello live | demos | demos | retained |
| Paid / LOI / pilot | 0 | 0 | 0–1 | ≥1 |
| YC app | done | — | — | — |

---

## Related

- [STRATEGY.md](./STRATEGY.md) — north star, dual-track (proof ∥ platform), competitive map  
- [YC-APPLICATION.md](./YC-APPLICATION.md) — paste into apply form  
- [BRAND.md](./BRAND.md) — craft bar (Ona-grade), not this month’s blocker  
- [CONNECTOR.md](./CONNECTOR.md) — Week 3 connector protocol + demo  
- [PRICING.md](./PRICING.md) — Free / Team $99 or ₹9,999 / connector pilot  
- [../time-to-url.txt](../time-to-url.txt) — daily machine T2U on ops.aft.page  

- [EVIDENCE-PACK.md](./EVIDENCE-PACK.md) — Week 4 close checklist + Phase 1 success test  

**Rule:** Ship platform with agents. Prove with strangers. Both every week.
