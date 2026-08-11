# Cron (product) — parked

**Status:** parked. Do not build or sell as its own product.

Schedule under the hood may return later as the **clock** for [AI automations](../STRATEGY.md) (prompt + schedule, e.g. 9am project brief). Sell the automation, not Cron.

## Intent (when unparked)

| | |
| --- | --- |
| What | Path on a claimed site + UTC schedule (hit that path on a clock) |
| Gate | Private / claimed — not anonymous Drop |
| Notify | Not a third product; Slack / mobile are sinks on results (via automations) |
| Slugs | `cron` reserved (also `ai`, `automations`, `brief`) |
| Clock | CF `scheduled()` — plumbing only |
| Not this | Kitesurf / browser automation — separately deferred |

## Already in the tree (leave alone)

- D1 `site_crons` (migration `0022_site_crons.sql`) — schema only; no product UI/API surface
- Reserved slug `cron`
- API Worker crons (`*/5` status, `0 4,16` smoke) — **ops**, not this product

## Build order

Drop → Plugins → AI automations. Plugin is P0. Unpark Cron only if automations need a schedule primitive and nothing thinner works.
