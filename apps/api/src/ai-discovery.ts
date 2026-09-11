/**
 * AI-discovery surface for api.aft.page — /llms.txt, /openapi.json, and the
 * agent affordances on the root JSON. Prowl / llms.txt crawlers read these.
 */
import type { Env } from "./env";

export const LLMS_TXT = `# aft.page API

Lang: en

> aft.page is a cloud for small software. Deploy HTML or a built dist/ to a live HTTPS URL in seconds. No account, no cloud setup. Agents build the software; aft turns it into a durable URL.

Base URL: https://api.aft.page

## When to use

- Deploy static HTML or a built site (Vite, React, static export) to a shareable URL.
- Re-deploy / update a site you already own (pass the slug + edit token).
- Deploy a public GitHub repo (Vite / Next build) to a live URL.
- List deploy history and roll back to a prior deploy.
- Claim a site you deployed anonymously (email or Google sign-in).

## Deploy (POST /v1/deploy)

Three accepted bodies:

1. multipart/form-data: field "files" (a File per path). Optional "<fileName>_path" to set a path.
2. application/json: {"files":[{"path":"index.html","content":"<html>…</html>","encoding":"utf8|base64"}]}
3. text/html (or empty content-type): the raw HTML body itself.

Optional query params: ?slug=<name> (must be owned by an edit token on PATCH), ?expires=1h|24h (anon quick-view self-destruct).

Response: {"slug","url","deployId","editToken","files","claimUrl"?,"expiresAt"?}

To update an existing URL: PATCH /v1/deploy?slug=<slug> with header x-aft-edit-token: <editToken> (or session). Same body formats. This deployId becomes rollback history.

Limits: 500 files, 25 MB each, 100 MB total.

## Claim (POST /v1/claim/start)

An anonymous deploy can be claimed with an email to keep the slug.
Body: {"slug":"<slug>","email":"you@example.com","editToken":"<editToken>"}

## Auth

- POST /v1/auth/start {"email":"you@example.com"} → sends a magic link.
- GET /v1/auth/verify?token=… → exchanges the link for a session cookie.
- GET /v1/me → current user (cookie or Bearer).
- GET /v1/auth/google → Google sign-in.

## Repo run (public GitHub)

- POST /v1/repo/check {"url":"https://github.com/owner/repo"} → detect plan.
- POST /v1/repo/deploy {"url":"…"} → static fast; Vite/Next build in background.
- GET /v1/jobs/{id}, GET /v1/jobs/{id}/events.
- POST /v1/jobs/{id}/stop — Bearer stopToken from the deploy 202. Job ids on pending pages are not enough.

## Inventory / operations (auth or edit token)

- GET /v1/me, GET /v1/me/sites?page=&limit=
- GET /v1/sites/{slug}/deploys
- GET /v1/sites/{slug}/files
- GET /v1/sites/{slug}/logs
- POST /v1/sites/{slug}/rollback {"deployId":"…"}
- GET|POST /v1/sites/{slug}/capabilities
- GET /v1/sites/{slug}/secrets, PUT|DELETE /v1/sites/{slug}/secrets/{name}
- GET|POST /v1/sites/{slug}/domains, POST /v1/sites/{slug}/domains/access, POST|DELETE /v1/sites/{slug}/domains/{hostname}
- POST /v1/sites/{slug}/connector/tokens, GET /v1/connector/poll, POST /v1/connector/result/{id}

## Other

- GET /health → {"ok":true}
- GET /v1/changelog, GET /v1/changelog.md, GET /v1/changelog.rss
- Remote MCP (deploy tools for agents): https://mcp.aft.page/mcp

Human site: https://aft.page
OpenAPI: https://api.aft.page/openapi.json
`;

/** Static OpenAPI 3.1 description of the public deploy surface. */
export function openapiDoc(root: string): Record<string, unknown> {
  return {
    openapi: "3.1.0",
    info: {
      title: "aft.page API",
      version: "1.0.0",
      description:
        "Deploy HTML or a built site to a live HTTPS URL. Cloud for small software — no account, no cloud setup.",
      termsOfService: `https://${root}/`,
      contact: { name: "aft.page", url: `https://${root}` },
    },
    servers: [{ url: `https://api.${root}` }],
    tags: [
      { name: "deploy", description: "Publish and update sites" },
      { name: "claim", description: "Claim an anonymous deploy" },
      { name: "auth", description: "Session and ownership" },
      { name: "repo", description: "Deploy a public GitHub repo" },
      { name: "sites", description: "Deploys, files, logs, rollback" },
      { name: "domains", description: "Custom domains" },
      { name: "meta", description: "Health, changelog, discovery" },
    ],
    paths: {
      "/v1/deploy": {
        post: {
          tags: ["deploy"],
          summary: "Deploy HTML or files to a live URL",
          description:
            "multipart field 'files', application/json {files:[{path,content,encoding}]}, or a raw text/html body. Optional ?slug= to target an existing site.",
          parameters: [
            {
              name: "slug",
              in: "query",
              schema: { type: "string", pattern: "^[a-z0-9](?:[a-z0-9-]{0,46}[a-z0-9])?$" },
              description: "Target an existing slug (PATCH only)",
            },
            {
              name: "expires",
              in: "query",
              schema: { type: "string", pattern: "^\\d+(s|m|h|d)?$" },
              description: "Anon quick-view self-destruct, e.g. 1h, 24h",
            },
          ],
          responses: {
            "200": {
              description: "Live URL",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      slug: { type: "string" },
                      url: { type: "string" },
                      deployId: { type: "string" },
                      editToken: { type: "string" },
                      files: { type: "number" },
                      claimUrl: { type: "string" },
                      expiresAt: { type: "string" },
                    },
                  },
                },
              },
            },
            "400": { description: "No files / invalid body" },
          },
        },
        patch: {
          tags: ["deploy"],
          summary: "Redeploy to an existing slug",
          description: "Requires x-aft-edit-token header or an owning session.",
          parameters: [
            {
              name: "slug",
              in: "query",
              required: true,
              schema: { type: "string" },
            },
          ],
          responses: { "200": { description: "Updated deploy" }, "404": { description: "Unknown slug" } },
        },
      },
      "/v1/claim/start": {
        post: {
          tags: ["claim"],
          summary: "Claim an anonymous deploy by email",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["slug", "email", "editToken"],
                  properties: {
                    slug: { type: "string" },
                    email: { type: "string", format: "email" },
                    editToken: { type: "string" },
                  },
                },
              },
            },
          },
          responses: { "200": { description: "Claim started" } },
        },
      },
      "/v1/auth/start": {
        post: {
          tags: ["auth"],
          summary: "Send a magic sign-in link",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["email"],
                  properties: { email: { type: "string", format: "email" } },
                },
              },
            },
          },
          responses: { "200": { description: "Email sent" } },
        },
      },
      "/v1/auth/verify": {
        get: {
          tags: ["auth"],
          summary: "Exchange a magic link token for a session",
          parameters: [
            {
              name: "token",
              in: "query",
              required: true,
              schema: { type: "string" },
            },
          ],
          responses: { "200": { description: "Session set" } },
        },
      },
      "/v1/me": {
        get: {
          tags: ["auth"],
          summary: "Current user",
          responses: { "200": { description: "User" }, "401": { description: "No session" } },
        },
      },
      "/v1/repo/check": {
        post: {
          tags: ["repo"],
          summary: "Detect build plan for a public GitHub repo",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["url"],
                  properties: { url: { type: "string", format: "uri" } },
                },
              },
            },
          },
          responses: { "200": { description: "Detected plan" } },
        },
      },
      "/v1/repo/deploy": {
        post: {
          tags: ["repo"],
          summary: "Deploy a public GitHub repo to a live URL",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["url"],
                  properties: { url: { type: "string", format: "uri" } },
                },
              },
            },
          },
          responses: { "200": { description: "Job started" } },
        },
      },
      "/v1/jobs/{id}": {
        get: {
          tags: ["repo"],
          summary: "Job status",
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "string" } },
          ],
          responses: { "200": { description: "Job snapshot" } },
        },
      },
      "/v1/sites/{slug}/deploys": {
        get: {
          tags: ["sites"],
          summary: "Deploy history for a slug",
          parameters: [
            { name: "slug", in: "path", required: true, schema: { type: "string" } },
          ],
          responses: { "200": { description: "Deploy list" } },
        },
      },
      "/v1/sites/{slug}/rollback": {
        post: {
          tags: ["sites"],
          summary: "Point a live slug at a prior deploy",
          parameters: [
            { name: "slug", in: "path", required: true, schema: { type: "string" } },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["deployId"],
                  properties: { deployId: { type: "string" } },
                },
              },
            },
          },
          responses: { "200": { description: "Rolled back" } },
        },
      },
      "/health": {
        get: {
          tags: ["meta"],
          summary: "Health check",
          responses: { "200": { description: "OK" } },
        },
      },
      "/llms.txt": {
        get: {
          tags: ["meta"],
          summary: "llms.txt agent index",
          responses: { "200": { description: "text/plain" } },
        },
      },
      "/openapi.json": {
        get: {
          tags: ["meta"],
          summary: "This OpenAPI document",
          responses: { "200": { description: "application/json" } },
        },
      },
    },
  };
}

/**
 * MCP manifest served at /.well-known/mcp.json — by the Worker on api.aft.page
 * and as a committed file on the apex. Both read this, so they cannot drift.
 */
export function mcpManifest(root: string): Record<string, unknown> {
  return {
    name: root,
    description: "Deploy HTML or a built dist/ to a live HTTPS URL. No account.",
    url: `https://mcp.${root}/mcp`,
  };
}

export function rootAffordances(root: string): Record<string, unknown> {
  return {
    openapi: `https://api.${root}/openapi.json`,
    llms: `https://api.${root}/llms.txt`,
    mcp: "https://mcp.aft.page/mcp",
    changelog: `https://api.${root}/v1/changelog`,
    status: `https://status.${root}/`,
  };
}
