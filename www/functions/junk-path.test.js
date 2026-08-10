import assert from "node:assert/strict";
import { isJunkPath } from "./junk-path.js";

assert.equal(isJunkPath("/.git/config"), true);
assert.equal(isJunkPath("/wp-login.php"), true);
assert.equal(isJunkPath("/api/.env"), true);
assert.equal(isJunkPath("/xmlrpc.php"), true);
assert.equal(isJunkPath("/missing-spa-route"), false);
assert.equal(isJunkPath("/settings"), false);
console.log("junk-path ok");
