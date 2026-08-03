# aft.page — strategy

Internal north star. Not a public README.

Updated: 2026-08-03

## Goal

**Employee → builder → business owner → investable founder → capital allocator.**

- **aft.page** is the company others invest in.
- **cubicL** is first allocator practice.
- **Polymerize** is runway. Do **not** resign during the first **seven-week** proof. Reassess ~month 3 with ESOP/runway/MRR clarity.
- Past GitHub / job commit volume is irrelevant to this scoreboard.

## Sam frame

> **Seven minutes can produce the app.  
> Seven days can produce a product.  
> Seven weeks can produce customer evidence.  
> Seven months can produce a real company.**

Coding is compressed. Do not shrink the company to seven minutes — spend calendar on customers + trust.

| Stage | Meaning | Status |
| --- | --- | --- |
| **Phase 0** Technical proof | Agent → live `*.aft.page` | **Done** — API/MCP/CLI/extension/hosting. Stop rebuilding this layer. |
| **Phase 1** Trusted sharing | Two coworkers safely use one app | **~80%** — private/invite/owner/deploys/rollback live; magic-link login + inventory UX closing the success test |
| **Phase 2** External-user proof | Conversations + weekly use | **Behind** — calendar, not code |
| **Phase 3** First paid | Charge for operational pain | Pricing written; nobody paid yet |
| **Phase 4** Connector proof | Live org data via outbound agent | **Early prototype shipped** — freeze deepening until Phase 2/3 demand |

North-star metric (not deploy count):

> **Organisations with an application used weekly by at least two people.**

## Company thesis

Simple hosting (auth + URL + private share) is **dead as a paid product** — free onboarding funnel only. ChatGPT Sites in the Work surface killed that wedge as a company.

Company:

> **The control plane for agent-built software.**  
> Any coding agent → your company’s identity, your data via your network, governed lifecycle — hosted by us today, in your cloud when you need it.

Enterprise line:

> **Your employees are creating software with AI. aft.page makes it visible, secure, and owned by your company.**

Spine of the pitch (structural, not launch gaps):

1. **Neutrality** across Claude / Codex / Cursor / Git — OpenAI will not govern competitors’ apps as first-class.
2. **Customer-controlled data path** — live org data and private networks via a connector (and later full BYOC), not raw credentials in a vendor cloud.

Caveat: “Sites has no live data connections” is a **launch limitation**, not a moat. They will ship connectors. Neutrality + customer-controlled execution stay the durable spine; the connector proves we are serious about the second.

## Competitive map

| Player | Layer |
| --- | --- |
| Ona → OpenAI | Agent **execution** runtime |
| ChatGPT Sites | Lightweight apps **inside** ChatGPT Work |
| Prized (YC S26) | Builder for non-engineers |
| **aft.page** | Neutral **control plane + runtime** every builder deploys *to* |

YC line: *Prized builds for non-engineers; we are the neutral runtime every builder deploys to.*

**Do not build for acquisition.** Build so OpenAI / Cloudflare / Vercel / MS / Anthropic / etc. must integrate, compete, or maybe buy — and so the company stands alone.

## Sequencing (do not reverse)

Risk #3: overbuilding a generic cloud before anyone uses apps weekly. Full BYOC = **6–12 months for a funded team**. Wrong for solo nights/weekends pre-customer.

### Phase 1 close (now)

| Item | Why |
| --- | --- |
| Magic-link login → inventory | Unblocks outsider success test |
| Invite + private share | Already shipped — keep demoable |
| Workspace / Entra OIDC | After magic-link; only if &lt;2 days |

### Clever middle (Phase 4 — freeze deepen)

**Connector agent** v0 exists (poll-based Node). Do not expand protocol until private apps are used weekly. Go/WebSocket later.

### Promise now, build on demand

Full BYOC data plane + formal residency. Build when a customer documents **~$15K+/yr** (or ₹12–40L) willingness.

## Product trio

| Surface | Role |
| --- | --- |
| **aft.page hosted** | Free funnel + small apps — not the paid company |
| **Control plane** | Identity, capabilities, inventory, lifecycle, approvals |
| **aft OSS + connector** | Portability + customer-network data path |

## Architecture

```
ChatGPT / Codex ─┐
Claude Code      ├──▶ aft.page (hosted control plane)
Cursor           │          │
Gemini           │          ├── Identity (magic-link now; Workspace later)
Internal agents ─┘          ├── Sharing (table stakes)
                            ├── Capabilities + approve-on-deploy
                            ├── Inventory + lifecycle
                            └── Connector agent (customer VPC) ──▶ live data / private APIs
                                         │
                                         └── later: full BYOC data plane (on demand)
```

## Operating model

Next month: **~50% product / ~40% customers / ~10% writing.**  
After trust product works: **~35% eng / ~50% customers / ~15% content.**

See **[30-DAY-PLAN.md](./30-DAY-PLAN.md)** and **[EVIDENCE-PACK.md](./EVIDENCE-PACK.md)**.

## Design bar

[ona.com](https://ona.com/) = craft bar, not product. See [BRAND.md](./BRAND.md).

## Funding & resignation

$4M now unlikely. Pre-seed / YC after evidence. Resign only with ESOP clarity, runway or signed funding, IP cleared — not after a working deploy command.

## Solo / geography

Sole founder for now. No YC → Pune. YC in → SF. Europe later via trips.

## Near-term mission

> Finish Phase 1 success test. Fill calendar with Phase 2 conversations. Charge when an operational problem is solved — not friend-money.

### Explicitly not optimising for

- Paid product = simple hosting
- Deepening connector before weekly two-person usage
- Full BYOC before weekly usage
- OpenAI acquisition as the plan
- Competing with Ona on agent execution / Prized on builders

## Scoreboard

| Metric | Why |
| --- | --- |
| Orgs with 2+ weekly users on one app | North star |
| YC application in | Deadline |
| Capability approval in deploy | Differentiator |
| Connector demo available (v0) | Whitespace vs Sites — not this week’s build |
| Polymerize IP reviewed | Diligence |
| Paid / LOI (non-friend) | Phase 3 |

Ship the wedge. Prove strangers care. Capital follows.
