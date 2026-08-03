# aft.page — 30-day plan

Internal. Goal: **compress Phase 1–2 into 30 days** and get **real customers (or design-partner teams) as fast as possible**.

Updated: 2026-08-03

Sam frame:

> Seven minutes → app. Seven days → product. Seven weeks → customer evidence. Seven months → company.

**Phase 0 (technical proof) is done** — stop rebuilding hosting. **Connector v0 is an early Phase 4 prototype** — freeze deepening until weekly two-person usage. Calendar is for Phase 1 success test + Phase 2 conversations.

North star: **orgs with an app used weekly by ≥2 people** (not deploy count).

Time split: ~50% product / ~40% customers / ~10% writing. After login ships, customers ≥ engineering.

---

## 30-day outcome (non-negotiable)

By day 30:

| Must have | Stretch |
| --- | --- |
| YC application submitted | YC interview invite |
| Polymerize IP reviewed (personal hardware only) | — |
| Identity + org + basic share working | Entra as well as Workspace |
| Capability approve-on-deploy visible (even ugly) | Connector v0 (outbound) on one dogfood app |
| **≥5 teams** using aft weekly (not just one-off deploys) | **≥10 apps / ≥5 orgs** (eight-week bar pulled forward) |
| **≥3 design-partner conversations** with a clear next step | **≥1 paying** or signed LOI / pilot letter |

**Customer definition (be honest):** a team that deploys more than once **and** would notice if aft disappeared. Anonymous one-shot HTML ≠ customer.

Paid can wait until week 3–4; **weekly usage cannot.**

---

## Positioning (say this every outreach)

> Any coding agent → your company’s identity, your data via your network, governed lifecycle — hosted by us today, in your cloud when you need it.

> Prized builds for non-engineers. Sites hosts inside ChatGPT. We are the neutral runtime every builder deploys *to*.

Free hosted URL = **funnel**. Company = **capabilities + inventory + connector path**.

---

## Calendar (30 days from 2026-08-03 → 2026-09-02)

### Week 1 (days 1–7) — Unlock + talk

**Product (agent-speed)**
- [ ] Ship users / orgs / sessions (Workspace OIDC first)
- [ ] Private + invite (good enough, not perfect)
- [ ] Submit **YC late application** + 1-min video ([YC-APPLICATION.md](./YC-APPLICATION.md))
- [ ] Read Polymerize employment agreement (IP / moonlighting)

**Customers (human-speed — this is the bottleneck)**
- [ ] List **50** targets: AI-forward startups, agent-using eng teams, internal-tools owners, YC/alumni-adjacent, Claude Code / Cursor power users
- [ ] Send **30** outreaches (short: “agent-built apps need a governed home — 15 min?”)
- [ ] Book **5** calls
- [ ] Dogfood one real app yourself daily (force inventory + pain)

**Exit week 1:** App in. IP read. ≥5 calls booked. Auth path live or days away.

### Week 2 (days 8–14) — Differentiator visible + first yeses

**Product**
- [x] Immutable deploy versions + **org inventory** (owner, version, last-used)
- [x] `aft.json` `capabilities` + deploy prints requests → approve/deny (v1: secrets + egress allowlist OK)
- [x] Expense/refund (or similar) dogfood app that *asks* for capabilities

**Customers**
- [ ] Run the 5+ calls; ask for **deploy this week**
- [ ] Send **30** more outreaches
- [ ] Convert **≥3 teams** to repeat deployers
- [ ] Start a shared “design partner” Notion/Sheet: name, agent they use, app, next step

**Exit week 2:** Someone other than you has approved a capability screen. ≥3 weekly teams.

### Week 3 (days 15–21) — Connector story + paid path

**Product**
- [x] Connector agent v0: one outbound binary/container; one declared capability enforced (e.g. read one table or hit one internal URL)
- [x] Dogfood app pulls **live data through connector** (Sites can’t match this demo)
- [x] Ugly paid offer: team plan / private apps / connector pilot price written down

**Customers**
- [ ] **10** live demos (capability + connector if ready)
- [ ] Push for **design partner MoU** or paid pilot ($99–500/mo or $2–5k pilot — pick one and stick)
- [ ] Ask every user: “Who else on your team should deploy?”

**Exit week 3:** Connector demoable once. ≥1 serious pilot conversation in writing.

### Week 4 (days 22–30) — Phase 1 close + evidence pack

**Product**
- [x] Magic-link login → inventory (Phase 1 success-test unblocker)
- [x] Inventory UX: login CTA, site actions, paste / preview links
- [x] Evidence pack + Phase 1 success-test runbook ([EVIDENCE-PACK.md](./EVIDENCE-PACK.md))
- [ ] **No** full BYOC / residency / SBOM theatre
- [ ] **No** connector deepen (v0 already demoable)

**Customers**
- [ ] Hit **≥5 weekly teams** (stretch 10 apps / 5 orgs)
- [ ] ≥1 org with **two users** on one app (Phase 1 success test externally)
- [ ] Close **≥1** paid or signed pilot / LOI (non-friend; ₹ or $ per [PRICING.md](./PRICING.md))
- [ ] Evidence pack filled: screenshots, deploy counts, quotes, demo link

**Exit day 30:** Usage evidence + at least one commercial yes (or dated written intent). Days 31–60 = more orgs + charge — deepen connector only on demand.

---

## Daily rhythm (non-negotiable)

| Block | Time | Job |
| --- | --- | --- |
| Build | 60–90 min | One shippable slice (auth, capabilities, connector) |
| Outreach | **60 min** | 5–10 messages / follow-ups — every day |
| Users | 30–60 min | Calls, demos, unblock a team |
| Dogfood | 15 min | Deploy or use aft yourself |

If build > outreach two days in a row, you are failing the 30-day goal.

Agents may compress build to “seven minutes.” **They cannot send your 30 messages.**

---

## Who to sell first (fastest path)

1. **Builders already using Claude Code / Cursor / Codex** who ship internal tools weekly  
2. **Small eng/product teams** drowning in agent-generated prototypes with no home  
3. **One security-minded champion** who cares about “what can this app touch?”  

Avoid: six-month enterprise procurement as week-1 motion. Promise BYOC on the pricing page; sell hosted + connector pilot now.

---

## Phases (Sam + compressed 30 days)

```text
Phase 0      Technical proof      DONE — agent → URL (do not rebuild)
Phase 1      Trusted sharing      login, private, invite, inventory, deploys (closing now)
Phase 2      External-user proof  conversations, weekly 2-person orgs (calendar)
Phase 3      First paid           Team ₹/$; design partner (charge for ops pain)
Phase 4      Connector proof      v0 early — deepen after weekly usage
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
| Weekly active teams | 1 | 3 | 5 | 5–10 |
| Capability approvals (non-you) | 0 | 1 | 3 | 5+ |
| Connector demos | 0 | 0 | 1 | 2+ |
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

**Rule:** Ship with agents. **Fill the calendar with customers.**
