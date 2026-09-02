import assert from "node:assert/strict";
import { CONTAINER_PUBLISH_PORT, isSandboxId, sandboxIdForJob } from "./origin.ts";

assert.equal(CONTAINER_PUBLISH_PORT, 8080);
assert.equal(sandboxIdForJob("run_abc123"), "run-run-abc123");
assert.equal(isSandboxId("run-run-abc123"), true);
assert.equal(isSandboxId("nope/../x"), false);
assert.equal(isSandboxId(""), false);
console.log("ok");
