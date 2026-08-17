# aft.page — regions

Internal. One product (agent → URL → claim → share). No country forks, no
`aft.cn`, no Aliyun-Workers clone.

**JP / KR / rest:** build when a named buyer asks (ladder below).

**China and EU are exceptions.** Build those for **growth**, not for one email.
The bet: they will **pay for the primitive** (mainland reach / EU residency),
not for a translated homepage.

Two-person weekly-use gate still wins this freeze ([STRATEGY.md](./STRATEGY.md)).
China/EU work is the **first growth queue after that gate** — not a parallel
company this month, not “wait until a Shanghai VP mails.”

## Ambition

**China:** every agent in mainland (Kimi, Trae, Lingma, Doubao, …) should
deploy Small Software through AFT. We are the default publish target, same
job as Cursor/Claude on global. They pay because the primitive (ICP-backed
China Network + a URL that actually opens) is scarce. Local tool install is
how we show up; the paid SKU is the primitive, not the plugin.

**EU:** every team that cannot put user apps on a US-only cloud should have
an AFT region they can sign a DPA for. They pay for residency, not for German
copy.

## What you sell on the first call

Always: **one cloud**, `*.aft.page`, existing SKUs.

- **EU:** “Yes, EU data / DPA is a paid primitive. Same product.”
- **China:** “Yes, mainland deploy is a paid primitive. Same product, China
  Network + ICP. Kimi/Trae install is how your agents hit it.”
- **JP/KR:** global works; language/invoice if they pay.

Never promise a date for ICP/WeChat/Alipay you have not bought. Do promise
the **shape**: same AFT, they fund the primitive.

## Ladder

| Rung | What | CN / EU (growth) | JP / KR / rest |
| --- | --- | --- | --- |
| **0 Global** | Same URL | Ship. Honest: mainland often needs VPN until rung 5 | Default |
| **1 Local tool** | Same `deploy` in *their* agent | **Build for growth.** Every China agent in the matrix (Kimi, Trae, Lingma, Doubao). EU: whatever they use (Cursor is enough) | When they name the agent |
| **2 Language** | Copy on aft.page | **Build for growth** (zh-CN, then one EU language if a country clusters) | When they ask |
| **3 Region / DPA** | EU R2 + DPA; still one codebase | **EU: build for growth** as a **paid** add-on | N/A unless they ask |
| **4 Legal** | Entity, VAT, Alipay, WeChat pay | After you are a company that invoices | After you invoice anyone |
| **5 China Network** | JD PoPs, same Workers | **China: the paid primitive.** Enterprise add-on + [ICP](https://developers.cloudflare.com/china-network/) + JD vet. Price so a team is *willing to pay* for reach, not a free VPN workaround | N/A |

Rung 1–3 (CN tool + zh copy; EU DPA/region) = growth builds you do **without**
waiting for a buyer, once the freeze gate is hit.

Rung 4–5 = still money + entity. You can **price and sell** rung 5 before it
is live (“mainland primitive, enterprise, we turn it on when ICP + CF China
Network are on the account”). You cannot fake the PoPs.

## Paid primitives (the thing they buy)

Not a country website. Two SKUs when selling starts:

1. **AFT EU** — data in EU, DPA. Team/annual. You build the region config.
2. **AFT China** — mainland-reachable deploy (China Network). Enterprise.
   Pass through CF/JD cost plus margin. They are paying for the primitive
   every agent in China needs if AFT is the default host.

Global cheap/free stays for VPN and everyone else. Do not give mainland
performance away on the free tier — that is the willingness-to-pay.

## China (exception)

- Distro: **every** mainland coding agent gets an official install path.
  Plugin/MCP parity with Cursor. That is the growth work.
- Cloud: still Cloudflare, then China Network — not a second runtime.
- Auth/share/pay (WeChat, Alipay) = rung 4, after primitive revenue, not
  the wedge.
- R2 still cannot live in mainland; say so. Workers/KV on China Network can.

## EU (exception)

- Distro is not the hole (Cursor already works).
- Growth work is **rung 3**: EU region + DPA PDF + a line on pricing.
- Language later unless one country is clearly paying.

## JP / KR

Not exceptions. CF works. Build rung 1–2 when they ask. No `aft.jp` / `aft.kr`.

## Script

1. One product. Apps stay on AFT.
2. CN/EU: we invest in the primitive; you pay for it.
3. China: your agent should `deploy` here like everyone else — install is
   free-ish; **mainland reach is paid**.
4. If they cannot open `https://aft.page` without VPN, they are a China
   primitive customer, not a confused global user.

## What this is not

Not Aliyun. Not five ccTLDs. Not breaking the freeze for ICP this month.
After the two-person gate, China agent matrix + EU paid region are the
growth builds — so when selling starts you are not shrugging at Shanghai or
Berlin.
