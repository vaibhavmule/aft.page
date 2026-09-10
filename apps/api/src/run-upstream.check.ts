import assert from "node:assert/strict";
import { isAllowedNextUpstream } from "./run-upstream.ts";

assert.equal(isAllowedNextUpstream("demo", "https://aft-u-demo.workers.dev"), true);
assert.equal(
  isAllowedNextUpstream("demo", "https://aft-u-demo.acct.workers.dev"),
  true,
);
assert.equal(isAllowedNextUpstream("demo", "https://aft-demo.workers.dev"), true);
assert.equal(isAllowedNextUpstream("demo", "https://demo.workers.dev"), true);
assert.equal(
  isAllowedNextUpstream("demo", "https://aft-u-victim.workers.dev"),
  false,
);
assert.equal(isAllowedNextUpstream("demo", "https://evil.example"), false);
assert.equal(isAllowedNextUpstream("demo", "http://aft-u-demo.workers.dev"), false);
assert.equal(isAllowedNextUpstream("demo", "not-a-url"), false);

console.log("ok");
