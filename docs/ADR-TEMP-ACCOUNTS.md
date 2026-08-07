# ADR: Temporary Accounts vs aft-owned Workers (7 Aug 2026)

## Context

Cloudflare Drop commoditizes static upload → URL → claim. Temporary Accounts extend the same pattern to real Workers for agents (`wrangler deploy --temporary`). We spiked whether Temporary Accounts can be AFT’s full-stack ownership model for Lattice-shaped apps.

## Spike results

| Check | Result |
| --- | --- |
| Worker + static assets + `/api/*` | Works (`aft-temp-spike.elderly-giraffe.workers.dev`) |
| Account reuse + claim URL | Works (60-minute claim window) |
| Redeploy on same temp account | Works |
| `wrangler secret put` non-interactive | Fails without temp-session token plumbing |
| Stable `*.aft.page` brand URL | Not native — workers.dev subdomain only |
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

Workers for Platforms remains a later optimization if per-Worker proliferation becomes costly.

## Consequences

- AFT owns lifecycle UX (claim, share, secrets, inventory) above CF primitives.
- We do not rebuild Drop, OpenNext adapters, or Sandbox.
- Lattice dogfood targets aft-account Worker + proxy, not temp workers.dev alone.
- Temp Accounts stay in the toolkit for zero-account agent previews.
