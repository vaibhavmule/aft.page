import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { acceptRunBody, isInternalRunHost } from "./accept-run.ts";

assert.equal(isInternalRunHost("run-container.internal"), true);
assert.equal(isInternalRunHost("RUN-CONTAINER.INTERNAL"), true);
assert.equal(isInternalRunHost("run-container.aft.page"), false);
assert.equal(isInternalRunHost("aft-run-container.workers.dev"), false);
assert.equal(isInternalRunHost("localhost"), false);

const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "index.ts"), "utf8");
assert.match(src, /isInternalRunHost\(url\.hostname\)/);
assert.match(src, /env\.AFT_API \|\| DEFAULT_API/);
assert.doesNotMatch(src, /body\.aft_api\s*\|\|/);

const ok = acceptRunBody({
  job_id: "run_abc123def456",
  job_token: "run_tok_" + "a".repeat(32),
  owner: "octocat",
  repo: "hello-express",
  slug: "hello-express",
  branch: "main",
  aft_api: "https://evil.example",
  plan: { install: "npm install", start: "npm start" },
});
assert.equal(ok.ok, true);
if (ok.ok) {
  assert.equal(ok.value.owner, "octocat");
  assert.equal(ok.value.branch, "main");
  assert.equal("aft_api" in ok.value, false);
}

assert.equal(
  acceptRunBody({
    job_id: "run_abc123def456",
    job_token: "run_tok_" + "a".repeat(32),
    owner: "octo; curl evil.test",
    repo: "hello-express",
    slug: "hello-express",
  }).ok,
  false,
);

assert.equal(
  acceptRunBody({
    job_id: "run_abc123def456",
    job_token: "run_tok_" + "a".repeat(32),
    owner: "octocat",
    repo: "hello-express",
    slug: "hello-express",
    branch: "main; rm -rf /",
  }).ok,
  false,
);

assert.equal(
  acceptRunBody({
    job_id: "run_abc123def456",
    job_token: "run_tok_" + "a".repeat(32),
    owner: "../etc",
    repo: "passwd",
    slug: "x",
  }).ok,
  false,
);

console.log("accept-run.check ok");
