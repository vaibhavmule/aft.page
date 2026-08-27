#!/usr/bin/env node
/** Fails if Next Run puts Cloudflare tokens in the untrusted build job. */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { strict as assert } from "node:assert";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const yml = readFileSync(join(root, ".github/workflows/run-next.yml"), "utf8");
const sh = readFileSync(join(root, "scripts/run-next-job.sh"), "utf8");

const deployAt = yml.search(/^  deploy:/m);
assert.ok(deployAt > 0, "run-next.yml must have a deploy job");
const beforeDeploy = yml.slice(0, deployAt);
const deployJob = yml.slice(deployAt);

assert.ok(
  !/CLOUDFLARE_API_TOKEN/.test(beforeDeploy),
  "CLOUDFLARE_API_TOKEN must not appear in the build job",
);
assert.ok(
  /CLOUDFLARE_API_TOKEN/.test(deployJob),
  "deploy job must still receive CLOUDFLARE_API_TOKEN",
);
assert.ok(/needs:\s*build/.test(deployJob), "deploy must need: build");
assert.ok(
  /include-hidden-files:\s*true/.test(yml),
  "artifact upload must include .open-next (dotdir)",
);
assert.ok(
  /AFT_RUN_DEPLOY|aft-run-deploy/.test(sh),
  "deploy must stage away from the clone before wrangler",
);
assert.ok(
  /npx --yes wrangler@4/.test(sh),
  "deploy must use registry wrangler, not clone node_modules/.bin",
);

console.log("ok: Next Run keeps Cloudflare tokens off the untrusted build job");
