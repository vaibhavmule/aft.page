# Capabilities (aft.json)

On deploy, if the upload includes `aft.json` with a `capabilities` block, aft.page records the request and returns it in the deploy response for **approve-on-deploy**.

`aft.json` may also set `runtime` (`static` | `worker` | `next`), optional `main`, and optional `upstream` (proxy target for worker/next).

## Shape

```json
{
  "name": "expense-approval",
  "runtime": "static",
  "capabilities": {
    "data": ["expenses:read", "expenses:approve"],
    "secrets": ["slack-webhook"],
    "egress": ["hooks.slack.com"]
  }
}
```

## APIs

### Capabilities
- Deploy / redeploy response may include `capabilities: { requested, status, summary, message }`
- `GET /v1/sites/{slug}/capabilities`
- `POST /v1/sites/{slug}/capabilities` (owner session) — approve requested (or body.approved subset)

Status is `pending` until the owner approves, or stays `approved` if a prior grant already covers the new request.

### Secrets vault (shipped)
- `GET /v1/sites/{slug}/secrets` — list **names** only (never values)
- `PUT /v1/sites/{slug}/secrets/{name}` — body `{ "value": "…" }` (owner/editor session or edit token)
- `DELETE /v1/sites/{slug}/secrets/{name}`

Values are encrypted at rest (AES-GCM via `AUTH_SECRET`). Names are listed; values are never returned. Static HTML cannot read the vault.

## MCP (thin surface)

MCP is **not** where capabilities/secrets are managed. Agents get three tools
only — see [ADR-MCP-THIN.md](./ADR-MCP-THIN.md):

| Tool | Job |
| --- | --- |
| `deploy_html` | HTML → live URL |
| `deploy_files` | Static files → live URL |
| `aft_health` | API ping |

Remote: `https://mcp.aft.page/mcp`. Capability approve + secrets vault stay on
the web API / owner session after claim.

## Enforcement

- **Approve-on-deploy** records grants in D1 (`GET|POST /v1/sites/{slug}/capabilities`).
- **Connector path** enforces approved `data` capabilities at invoke time. v0 executable capability: `expenses:read` (see [CONNECTOR.md](./CONNECTOR.md)).
- **Secrets:** vault storage shipped. Arbitrary egress proxy is still a stub (declare `egress` for approve-on-deploy visibility).

## Dogfood

- `examples/expense-approval/` — capabilities + connector
- `examples/next-hello/` — `runtime: next` + upstream proxy; live at [next-hello.aft.page](https://next-hello.aft.page)
