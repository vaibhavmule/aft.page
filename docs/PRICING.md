# Pricing (ugly offer)

Internal sales sheet. List prices for the conversation; first deals close
whatever the buyer will pay. **Personal / Team / Enterprise** are the SKUs —
do not invent a fourth. Discount or pilot down, do not invent custom feature
packs mid-call.

Quote **USD for US / YC** calls. Hide INR until India checkout exists.

**Close rule:** any non-friend paid money or signed LOI counts as Phase 4 proof.
Public site: Free / Personal (30 days then $19) / one Team & Enterprise Contact.
Billing is not live yet — no Creem checkout on the homepage.

Never give perimeter (IP whitelist) on Personal or Team — that is Enterprise.

## Free

- Hosted public deploys
- MCP / agent deploy
- Claim + basic share for dogfooding
- Per-site secrets after claim ([docs/env](https://aft.page/docs/env/))

The free tier proves the Small Software activation loop.

Private **containers** are not a SKU. Hosted runtime today is Workers.

## Personal — **30 days free, then $19 / mo**

One person. Private apps, higher limits than Free. Viewers still don't pay.
The only self-serve paid SKU. Creem product when billing starts (`1900` cents,
recurring, 30-day trial, tax exclusive, `saas`).

## Team — **Talk** (`hello@aft.page`)

No public price. Design-partner close. On the call: **$99 / mo**.

Private apps + invite ACL (view/edit/revoke). Durable projects, updates and
rollback, secrets, founder email support. Stateful / full-stack **as it ships**.

Creem: `prod_KRqO1PPmVnPbXQ9X40vZa` ($99). Use after they say yes — not on
the homepage.

## Enterprise — **Talk** (`hello@aft.page`)

No public price. On the call: **$499 / mo** or **$2,000 / 30-day pilot**.
Pick **one** offer per deal — perimeter **or** connector.

**Perimeter** (vs Vercel Advanced $150 + Enterprise IPs):

- IP whitelist / Trusted IPs–class access
- Automation bypass secrets
- Protection exceptions (pre-prod domains)
- Domain allowlist / org SSO as they ship

**Connector** (design partner):

- Outbound connector agent
- Governed live data path (`expenses:read`-style capabilities)
- Design-partner Slack / weekly check-in during pilot

Friend-money does not count.

## BYOC / large enterprise

Listed as “available” — build when a customer documents **~$15K+/yr**
willingness (run-in-their-cloud). Not the Talk SKU above.

## What to say

> Free to go live. Personal is 30 days free, then $19. Team and Enterprise
> — one conversation.

Do not invent custom pricing mid-call. Discount only for a written pilot / LOI
and a public quote.
