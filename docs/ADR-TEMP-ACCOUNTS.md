# ADR: Temporary Accounts vs aft-owned Workers (7 Aug 2026)

## Context

Cloudflare Drop commoditizes static upload → URL → claim. Temporary Accounts extend the same pattern to real Workers for agents (`wrangler deploy --temporary`). We spiked whether Temporary Accounts can be AFT’s full-stack ownership model for worker-shaped apps.

## Spike results

| Check | Result |
| --- | --- |
| Worker + static assets + `/api/*` | Works (`aft-temp-spike.elderly-giraffe.workers.dev`) |
| Account reuse + claim URL | Works (60-minute claim window) |
| Redeploy on same temp account | Works |
| `wrangler secret put` non-interactive | Fails without temp-session token plumbing |
| Stable aft.page brand URL | Not native — workers.dev subdomain only |
| Bot challenge on temp `workers.dev` | Observed intermittent 403 challenge before JSON |
| Containers / Sandbox | Not validated; docs list limited product support on temp accounts |

Spike artifact: [`spikes/temp-accounts-worker/`](../spikes/temp-accounts-worker/).

## Decision

**Use aft-owned Cloudflare Workers as the production full-stack backend.** Temporary Accounts remain useful for agent demos and “try before claim” when brand URL and secrets are not required.

URL strategy for production:

1. Deploy per-site Worker scripts into the **aft Cloudflare account** (`aft-u-{slug}`).
2. Register `runtime=worker` + worker hostname in D1.
3. **Proxy** `https://{slug}.aft.page/*` through the existing platform Worker (ACL, metrics, sharing) → upstream site Worker.
4. Store app secrets in an **aft D1 vault** and sync to the site Worker via Cloudflare API (or inject at proxy edge when CF secret sync is unavailable).

Workers for Platforms remains a later optimization if per-Worker proliferation becomes costly. Costing delta vs today’s setup: see below.

## Costing — now vs Workers for Platforms (future)

Do not buy WfP for request volume. Buy it when **script count** or **proxy double-bill** hurts.

| | Now (aft-owned Workers) | Later (Workers for Platforms) |
| --- | --- | --- |
| Floor | Workers Paid **$5**/mo (free tier until then) | WfP Paid **$25**/mo |
| Scripts | **100** free / **500** paid — hard cap | Unlimited (1,000 included, then **$0.02**/script ≈ free) |
| Requests included | 10M / mo | 20M / mo |
| CPU ms included | 30M / mo | 60M / mo |
| Overage | $0.30/M req · $0.02/M CPU-ms | same rates |
| Chain billing | User hit → `aft-page-api` **+** fetch to `aft-u-{slug}` = **2 inbound requests** | Dispatch → user Worker → outbound = **1 request** billed |
| Static Drop | One platform Worker + R2/KV. Asset requests free. Unaffected. | Same. WfP does not make Drop cheaper. |

**Today’s bill is almost all the one platform Worker.** Static sites do not create a Worker per slug. Only `runtime: worker` / `next` mint `aft-u-{slug}` and eat the 500-script cap.

Switch when either:
1. aft-owned site Workers approach ~400 (leave headroom under 500), or
2. worker/next traffic is large enough that paying twice per hit > the extra $20 floor.

**Runnable OSS caveat (2026-08-23):** if GitHub “Run on AFT” ships (extension, `@aft`,
probe-at-scale), script count may become product-critical before organic site growth —
revisit WfP trigger early. See [RUN.md](./RUN.md).

ops.aft.page cost row shows this as **WfP trigger** (`stay` / `watch` / `switch`). Look there, not the dashboard template.

Until then $5 Workers Paid (or free) wins. WfP is a second product (dispatch namespace + user Workers), not a dashboard toggle — see 9 Aug 2026: do not start from `workers-for-platforms-template`.

## Consequences

- AFT owns lifecycle UX (claim, share, secrets, inventory) above CF primitives.
- We do not rebuild Drop, OpenNext adapters, or Sandbox.
- Full-stack dogfood targets aft-account Worker + proxy, not temp workers.dev alone.
- Temp Accounts stay in the toolkit for zero-account agent previews.
