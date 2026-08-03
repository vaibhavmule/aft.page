# YC Fall 2026 — application draft (aft.page)

Internal. Paste into [apply.ycombinator.com](https://www.ycombinator.com/apply). Late application still accepted; on-time decisions by Aug 28 — late has no promised date. Batch: Oct–Dec 2026, SF. Invest on acceptance.

Fill founder bio / equity / location / video yourself. Below = company narrative.

---

## Company name

**aft.page** (product) / working legal name TBD (suggest **Aft** or **Aft Labs**)

## Describe what your company does in 50 characters or less

`Secure home for apps AI agents build`

(38 chars — alt: `Home for AI-built apps companies trust`)

## Company URL

https://aft.page

## What is your company going to make? Explain what your product does as if to a potential user. (longer)

People and AI coding agents (Claude Code, Codex, Cursor, ChatGPT, internal bots) can now spit out useful small software in minutes — expense tools, dashboards, refund flows, sprint trackers. Deploying and governing that software is still broken.

ChatGPT Sites hosts apps *inside* one vendor. Prized helps non-engineers *build*. Neither is a neutral place every agent deploys *to*, with company identity, an inventory of every agent-built app, and approval for what each app may touch (databases, internal APIs, secrets, egress) — including live data that stays on the company’s network.

**aft.page** is that control plane:

1. Deploy from any agent (MCP today; CLI for your own cloud) → live URL in seconds.
2. Company identity (Google Workspace / Microsoft Entra) and Doc-style sharing.
3. On deploy: the app declares **capabilities**; a human approves or denies before it runs.
4. Org-wide inventory: owner, version, capabilities, last used.
5. **Connector agent** in the customer VPC (outbound-only) so apps can use live org data without shipping raw credentials to us. Full BYOC later when a customer pays for it.

One line users feel: *Any coding agent → your identity, your data via your network, governed lifecycle.*

## Why did you pick this idea? Do you have domain expertise?

I spent years shipping and operating secure multi-tenant enterprise software (auth, tenancy, customer-specific controls, infra). I also built **aft**, an open-source CLI that deploys frontends into the customer’s own AWS — so “run it in *their* cloud” is not theoretical.

Separately, agents made building trivial; Claude Artifacts still mostly exited to Copy/Download. I shipped **aft.page** (hosted deploy + MCP + Chrome extension) so agent output becomes a live URL immediately. Then ChatGPT Sites and Prized made clear that auth+hosting alone is table stakes. The durable gap is the **neutral control plane**: capability approval, inventory, and customer-network data — which OpenAI structurally cannot own across Claude/Cursor without governing competitors.

YC’s Fall 2026 RFS (“A Cloud for Small Software”) names the category. We were already building the rails; the RFS sharpened the company, it didn’t invent the insight.

## Who are your competitors? What do you understand about them that they don’t?

| Competitor | What they are | What we are not / are |
| --- | --- | --- |
| ChatGPT Sites | Great inside OpenAI’s surface | Vendor-locked; not neutral; launch gaps on live org data — they’ll close some; they won’t prioritize Claude/Cursor as first-class |
| Prized (YC S26) | Builder for non-engineers | We are the **runtime they (and engineers) deploy to** |
| Ona / OpenAI | Secure execution for long-running coding agents | Different layer — we govern *deployed small software*, not background PR factories |
| Vercel / Netlify / Cloudflare Pages | Excellent general hosting | Not agent-native capability grants + org inventory of *agent-built* apps |
| Superblocks / internal-tool platforms | Hybrid connectors exist | We’re agent-first + lightweight small-software cloud, not a heavy IDE for ops teams |

Insight: the buyer isn’t “host my HTML.” It’s “employees are generating software with five agents — make it visible, approved, and owned by us.”

## How do or will you make money?

Free hosted funnel (agent → URL) for adoption. Paid: team/org seats, private apps, capability governance, inventory, connector for live data. Enterprise: SSO, policies, later BYOC when willingness to pay is documented (~$15K+/yr signal). OSS CLI stays distribution/trust for customer-cloud deploy.

Early: design partners on team plans; not chasing enterprise procurement before weekly usage.

## How far along are you?

**Live product:** https://aft.page — paste/upload or MCP → `*.aft.page` URL. Chrome extension deploy from ChatGPT/Claude. Worker tests. Metrics scaffolding. Sibling OSS CLI (`aft`) deploys to customer AWS (and Cloudflare Pages path).

**Not yet (roadmap, weeks not years):** Workspace/Entra orgs, Doc-style sharing, immutable deploys + inventory, `aft.json` capabilities + approve-on-deploy, VPC connector agent, expense-app dogfood through connector.

Honest: strong wedge infrastructure; control-plane differentiation is the next build, not vapor — sequenced so we don’t boil the ocean on full BYOC pre-usage.

## How long have you been working on this?

aft CLI + aft.page: concentrated build from mid/late July 2026 (nights/weekends alongside full-time employment). Domain background: years in enterprise SaaS/security-adjacent product engineering.

## What is the next step for your product / company?

1. Submit this application; clear employment IP (personal hardware/accounts only).
2. Ship identity + sharing + inventory.
3. Ship capability approval on deploy + connector agent (outbound VPC) enforcing those capabilities.
4. Dogfood expense/refund app with live data through connector — demo Sites can’t match today.
5. ~10 real apps / ~5 orgs as evidence bar; YC batch if accepted → SF full-time.

## Something surprising / impressive you’ve done (founder)

Shipped a real multi-cloud-adjacent deploy path (OSS CLI into customer AWS with destroy/safety hardening) and a hosted agent MCP path to production URLs in days — then *changed the company thesis* when Sites/Prized made hosting-alone obsolete, instead of clinging to the first wedge.

## Video notes (1 min)

Show, don’t lecture:

1. Agent builds a tiny expense/refund tool (or show existing).
2. `aft deploy` / MCP → URL live.
3. (Even mock/UI) capability list: read X, POST Y, egress Z → Approve.
4. Say one line: *Prized builds; Sites hosts inside ChatGPT; we are the neutral control plane every agent deploys to — your identity, your data on your network.*
5. End on aft.page wordmark + URL.

---

## Application do / don’t

**Do:** Lead with shipped MCP + live URLs. Name Sites and Prized directly. Capability + connector as the wedge. Solo OK; GTM is the gap you’ll hire.

**Don’t:** Claim you invented the YC RFS. Promise full BYOC as built. Position as “Claude hosting.” Pretend auth+private share is the moat. Overstate users if you don’t have them — under-promise traction, over-prove infra.

## After submit

- Polymerize IP evening.
- Spec connector protocol (capability declaration, outbound tunnel, enforcement) so step 6 coding doesn’t drift.
- Keep building steps 3–5 without waiting for YC reply.
