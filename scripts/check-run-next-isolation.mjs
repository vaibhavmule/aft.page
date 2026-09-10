#!/usr/bin/env node
/**
 * Next Run: platform deploy token must not share a GHA job with untrusted
 * `npm install` / the cloned repo. Artifact only `.open-next`; deploy uses
 * registry wrangler@4 from a clean staging dir.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const yml = readFileSync(join(root, ".github/workflows/run-next.yml"), "utf8");
const sh = readFileSync(join(root, "scripts/run-next-job.sh"), "utf8");

assert.match(yml, /^  build:/m);
assert.match(yml, /^  deploy:/m);
assert.match(yml, /needs:\s*build/);

const buildStart = yml.search(/\n  build:/);
const deployStart = yml.search(/\n  deploy:/);
assert.ok(buildStart >= 0 && deployStart > buildStart, "build job must precede deploy");
const buildJob = yml.slice(buildStart, deployStart);
const deployJob = yml.slice(deployStart);

assert.doesNotMatch(buildJob, /CLOUDFLARE_API_TOKEN/);
assert.doesNotMatch(buildJob, /CLOUDFLARE_ACCOUNT_ID/);
assert.match(buildJob, /run-next-job\.sh build/);
assert.doesNotMatch(buildJob, /run-next-job\.sh deploy/);
assert.match(buildJob, /upload-artifact/);
assert.match(buildJob, /\.open-next/);

assert.match(deployJob, /CLOUDFLARE_API_TOKEN/);
assert.match(deployJob, /download-artifact/);
assert.match(deployJob, /run-next-job\.sh deploy/);
assert.doesNotMatch(deployJob, /git clone/);
assert.doesNotMatch(deployJob, /npm install/);
assert.doesNotMatch(deployJob, /run-next-job\.sh build/);
assert.match(deployJob, /aft-run-stage/);

assert.match(sh, /npx --yes "\$WRANGLER_PKG"/);
assert.match(sh, /wrangler@4/);
assert.match(sh, /must not contain the cloned repo/);
assert.doesNotMatch(sh, /npx wrangler deploy/);

console.log("ok");
