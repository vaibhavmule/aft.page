# Capabilities (aft.json)

On deploy, if the upload includes `aft.json` with a `capabilities` block, aft.page records the request and returns it in the deploy response for **approve-on-deploy**.

## Shape

```json
{
  "name": "expense-approval",
  "capabilities": {
    "data": ["expenses:read", "expenses:approve"],
    "secrets": ["slack-webhook"],
    "egress": ["hooks.slack.com"]
  }
}
```

## APIs

- Deploy / redeploy response may include `capabilities: { requested, status, summary, message }`
- `GET /v1/sites/{slug}/capabilities`
- `POST /v1/sites/{slug}/capabilities` (owner session) — approve requested (or body.approved subset)

Status is `pending` until the owner approves, or stays `approved` if a prior grant already covers the new request.

## Enforcement

- **Approve-on-deploy** records grants in D1 (`GET|POST /v1/sites/{slug}/capabilities`).
- **Connector path** enforces approved `data` capabilities at invoke time. v0 executable capability: `expenses:read` (see [CONNECTOR.md](./CONNECTOR.md)).
- Secrets injection and arbitrary egress proxy are still stubs.

## Dogfood

See `examples/expense-approval/` — deploy with multipart/JSON including `aft.json` + `index.html`, approve capabilities, run `apps/connector`, open the site.