# aft.page connector agent (v0)

Outbound-only agent. Runs in your network, dials **out** to `api.aft.page`, serves **local** data for approved capabilities. Expense rows never leave this machine in the demo.

## Quick start

```bash
cd apps/connector
npm install
npm run build

# 1. Own a site, approve capabilities, mint a token (session cookie required):
# POST https://api.aft.page/v1/sites/{slug}/connector/tokens

export AFT_CONNECTOR_TOKEN='aft_conn_…'
export AFT_API=https://api.aft.page   # optional
npm start
```

Local mock data: [`expenses.json`](./expenses.json). Override with `AFT_EXPENSES_FILE=/path/to/file.json`.

## Demo path

1. Deploy `examples/expense-approval/` to aft.page (include `aft.json`).
2. Claim / own the slug; `POST /v1/sites/{slug}/capabilities` to approve.
3. Mint connector token; run this agent.
4. Open `https://{slug}.aft.page` — list loads via `expenses:read` through the connector.

## Protocol

| Step | Endpoint |
| --- | --- |
| Mint | `POST /v1/sites/{slug}/connector/tokens` (owner session) |
| Poll | `GET /v1/connector/poll?wait=25` (`Authorization: Bearer …`) |
| Result | `POST /v1/connector/result/{invokeId}` |
| Invoke | `POST /v1/sites/{slug}/connector/invoke` `{ "capability": "expenses:read" }` |

v0 enforces **one** data capability: `expenses:read`. See [docs/CONNECTOR.md](../../docs/CONNECTOR.md).
