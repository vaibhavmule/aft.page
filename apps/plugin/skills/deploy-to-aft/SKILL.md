---
name: deploy-to-aft
description: Build and publish a static site or small app to hosted aft.page through its remote MCP, then return the live URL. Use when the user explicitly asks to deploy, publish, host, or ship to aft.page, update an existing aft.page deployment, inspect its deploy history, or roll it back. Do not use for the separate AFT BYO-cloud CLI unless the user explicitly asks for that product.
---

# Deploy to aft.page

Publish ready static files to a live HTTPS `*.aft.page` URL. The live URL is
the deliverable. The remote MCP is a thin upload adapter: inspect and build the
project locally, then pass the final artifact to its tools.

This skill is for the hosted aft.page service. It does not run the separate
`aft` CLI, which deploys into a user's AWS or Cloudflare account and uses
different configuration and state formats.

## Tools and boundaries

Use the `aft-page` MCP server:

- `deploy` publishes a first deploy or updates an unclaimed deploy.
- `aft_deploys` lists rollback history for an unclaimed deploy.
- `aft_rollback` restores a prior deploy for an unclaimed deploy.
- `aft_health` diagnoses MCP/API connectivity.

The MCP cannot read the workspace or build the app. Read files and run the
project's build locally. Never send source directories when a built output
directory exists.

## Public-deploy safety

An anonymous MCP deployment is public immediately. Claiming it does not make
it private automatically. Unclaimed deploys are deleted after 30 days idle —
when the deploy result includes `notice`, include that exact line in the final
user reply. A visit, update, or claim resets that clock. If the user asks for
a private deployment, the project appears to contain sensitive content, or
publication intent is not clear, stop and explain that this MCP cannot make
the first upload atomically private. Get explicit confirmation before
publishing anything sensitive.

Treat an upload as irreversible disclosure. Failed upload bytes may be kept in
short-lived operational diagnostics. Never upload secrets or credentials,
including `.env*`, `.git/`, `.aws/`, `.ssh/`, private keys, certificates,
`.aft/`, or cloud configuration. Inspect generated bundles and source maps for
embedded secrets; omit source maps unless the user needs them and they are safe.

## Read configuration and state

1. Identify the exact app root. In a monorepo, use the app the user named or
   the one clearly established by the current task; do not deploy the whole
   repository.
2. Read `aft.json` if present. The hosted manifest may contain `name`, `slug`,
   `runtime`, `main`, `upstream`, `capabilities`, and `badge`. A `build` or
   `output` field is only a local agent convention, not a hosted API field;
   inspect any command before running it.
3. If `aft.json` contains BYO-cloud fields such as `provider`, `bucket`,
   `distribution`, `region`, or a CLI-style `dir`, do not reinterpret or
   overwrite it. Explain that this is the separate AFT CLI configuration and
   ask the user which product they intend to use.
4. Read `.aft/state.json` if present. Hosted MCP state must contain non-empty
   string `slug` and `editToken` values and must not contain cloud-provider
   state. Never overwrite an unknown or incompatible state shape.
5. Keep `editToken` secret. Never print it, paste it into the final response,
   commit it, or include `.aft/` in the upload.

## Detect and build

Inspect `package.json` and build configuration before executing commands. Use
the package manager selected by the repository's lockfile. If dependencies are
missing, use its locked/frozen install mode. Run the declared build and require
it to succeed; never upload stale output after a failed build.

Choose one path:

1. Plain HTML with no bundler: upload `index.html`, plus only its required
   static assets. A single self-contained page may call `deploy` with `html`.
2. Vite, React, or Vue: run the project build and upload `dist/`.
3. Create React App or Rsbuild: run the project build and upload its actual
   `build/` or `dist/` output.
4. Next.js configured for static export: run the build and upload `out/`.
5. SSR, server-only, Worker, or `next` runtimes: stop. Do not
   upload `.next/` or source. This plugin's deploy path is static-only.

If `aft.json` contains a local `output` convention, confirm that it matches the
fresh build artifact before using it. Do not invent a build for plain HTML.

## Validate the artifact

Before calling `deploy`:

- Enumerate only the selected output root and do not follow symlinks outside it.
- Require `index.html` at the deployed root.
- Enforce at most 200 files, 10 MB per file, and 50 MB total.
- Use safe relative paths only: no absolute paths, `..`, or backslashes.
- Exclude `.git`, `.env*`, `.aws`, `.ssh`, `.aft`, `node_modules`, `src`,
  `.next`, private keys, credentials, and unrelated project files.
- Send text as UTF-8 and binary files as base64 with `encoding: "base64"`.
- Include a safe hosted `aft.json` at the deployed root when one exists and is
  relevant. Never include CLI configuration or secret state.

## First deploy

Use this flow only when no valid hosted `.aft/state.json` exists:

1. If `aft.json.slug` is a valid lowercase slug, pass it as `preferred_slug`.
   Otherwise omit `preferred_slug` and accept the allocated slug; do not invent
   one silently. A first deploy never overwrites an existing slug.
2. Add `.aft/` to `.gitignore` without removing existing entries.
3. Call `deploy` exactly once with either `html` for one self-contained page or
   `files` for the validated artifact.
4. Require a successful structured result containing `url`, `slug`,
   `deployId`, and `editToken`. Do not expose the token.
5. Write `.aft/state.json` as `{ "slug": "...", "editToken": "..." }` using
   the returned values. Preserve it as secret local state.
6. Verify the live URL with an HTTP GET when available.
7. Return the live URL and, when the first-deploy result contains a distinct
   `claimUrl`, the claim URL. State that the site is public. When the result
   includes `notice`, include that exact line in the user-facing reply.

## Update the same URL

With valid hosted state, pass both `preferred_slug` and `edit_token` from that
state. Call `deploy` once with the new validated artifact. Never retry without
the token: doing so creates a second public site.

Verify that the returned slug and URL match the existing site. Return the live
URL, but do not label the live URL as a claim link when the structured result
does not contain a distinct `claimUrl`.

The current remote MCP cannot authenticate as an aft.page web session. After a
site is claimed, token-only update, history, and rollback calls may return 401.
If that happens, do not create a replacement site. Direct the user to the
claimed site's project management flow until session/OAuth support is added.

## Rollback

Rollback only on an explicit user request:

1. Read valid hosted state.
2. Call `aft_deploys` with its slug and edit token.
3. Select only a deploy ID returned by that call; confirm the requested target
   if the user did not identify one unambiguously.
4. Call `aft_rollback` once and verify the same live URL.

## Failures

On a deploy or update failure, preserve existing state and do not fall back to
a fresh anonymous POST. Use `aft_health` for connectivity diagnosis, fix the
artifact or request, and retry only with the same intended first-deploy/update
semantics. Report the concrete error without revealing the edit token.
