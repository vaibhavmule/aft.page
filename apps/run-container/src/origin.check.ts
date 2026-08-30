import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CONTAINER_PUBLISH_PORT,
  acceptRebind,
  isInternalRunHost,
  isSandboxId,
  sandboxIdForJob,
} from "./origin.ts";

assert.equal(CONTAINER_PUBLISH_PORT, 8080);
assert.equal(sandboxIdForJob("run_abc123"), "run-run-abc123");
assert.equal(isSandboxId("run-run-abc123"), true);
assert.equal(isSandboxId("nope/../x"), false);
assert.equal(isSandboxId(""), false);

assert.equal(isInternalRunHost("run-container.internal"), true);
assert.equal(isInternalRunHost("RUN-CONTAINER.INTERNAL"), true);
assert.equal(isInternalRunHost("run-container.aft.page"), false);
assert.equal(isInternalRunHost("aft-run-container.workers.dev"), false);
assert.equal(isInternalRunHost("localhost"), false);

assert.deepEqual(acceptRebind({ sandbox_id: "run-run-abc123" }), {
  ok: true,
  sandboxId: "run-run-abc123",
  port: 8080,
});
assert.deepEqual(acceptRebind({ sandbox_id: "run-run-abc123", port: 8080 }), {
  ok: true,
  sandboxId: "run-run-abc123",
  port: 8080,
});
assert.equal(acceptRebind({ sandbox_id: "run-run-abc123", port: 3000 }).ok, false);
assert.equal(acceptRebind({ sandbox_id: "nope/../x" }).ok, false);
assert.equal(acceptRebind({}).ok, false);

const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "index.ts"), "utf8");
assert.match(src, /\/v1\/rebind[\s\S]{0,400}isInternalRunHost\(url\.hostname\)/);

console.log("ok");
