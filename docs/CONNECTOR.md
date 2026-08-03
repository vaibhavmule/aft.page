# Connector agent (v0)

Outbound poll agent for **governed live data**. Runs in the customer network (or on a laptop for demos), dials **out** to aft.page — no inbound ports.

## Why

Hosting on Vercel/AWS serves HTML. The connector is how an agent-built app reaches **private** data under an approved `aft.json` capability — without putting credentials in aft cloud.

## Demo script (Sites can’t match this)

1. Deploy [`examples/expense-approval/`](../examples/expense-approval/) (HTML + `aft.json`).
2. Claim the slug; approve capabilities (`POST /v1/sites/{slug}/capabilities`).
3. Mint a token: `POST /v1/sites/{slug}/connector/tokens` (owner session).
4. Run [`apps/connector/`](../apps/connector/) with `AFT_CONNECTOR_TOKEN`.
5. Open `https://{slug}.aft.page` — expenses load from the agent’s local `expenses.json`.

## Protocol

```text
Browser  →  POST /v1/sites/{slug}/connector/invoke  { capability: "expenses:read" }
Worker   →  checks approved grant; creates pending job
Agent    →  GET /v1/connector/poll?wait=25  (Bearer token)
Agent    →  reads local expenses.json
Agent    →  POST /v1/connector/result/{id}
Browser  →  GET /v1/sites/{slug}/connector/invokes/{id}  until done
```

### Endpoints

| Method | Path | Who |
| --- | --- | --- |
| POST | `/v1/sites/{slug}/connector/tokens` | Owner session |
| GET | `/v1/sites/{slug}/connector` | Site accessors — online / grant status |
| POST | `/v1/sites/{slug}/connector/invoke` | Site accessors |
| GET | `/v1/sites/{slug}/connector/invokes/{id}` | Site accessors |
| GET | `/v1/connector/poll?wait=0..25` | Connector Bearer token |
| POST | `/v1/connector/result/{id}` | Connector Bearer token |

## Enforcement (v0)

- Invoke requires capability **approved** and present in `approved.data`.
- Only **`expenses:read`** is executable; other declared caps remain approve-only stubs.
- Connector refuses unknown capabilities at the edge.
- Mock VPC data = local JSON beside the agent — **not** stored in D1/R2.

## Not in v0

Go binary, WebSocket tunnel, Durable Objects, real SQL, Slack egress, `expenses:approve` enforcement, multi-connector fleets.

## Related

- [CAPABILITIES.md](./CAPABILITIES.md)
- [PRICING.md](./PRICING.md)
- [STRATEGY.md](./STRATEGY.md) — connector as the clever middle path to BYOC
