/** Runnable check: editToken + slug → PATCH; slug alone → POST. */
import assert from "node:assert/strict";
import { deployMethod, filesFromDeployInput, slugFromFiles } from "./client.js";

assert.equal(deployMethod("discovra"), "POST");
assert.equal(deployMethod("discovra", "aft_edit_x"), "PATCH");
assert.throws(() => deployMethod(undefined, "aft_edit_x"), /preferred_slug/);
assert.equal(
  slugFromFiles([
    { path: "index.html", content: "<h1>x</h1>" },
    { path: "aft.json", content: '{"slug":"discovra","runtime":"static"}' },
  ]),
  "discovra",
);
assert.equal(slugFromFiles([{ path: "index.html", content: "<h1>x</h1>" }]), undefined);
assert.deepEqual(filesFromDeployInput({ html: "<h1>x</h1>" }), [
  { path: "index.html", content: "<h1>x</h1>", encoding: "utf8" },
]);
assert.throws(() => filesFromDeployInput({}), /html or files/);
console.log("ok");
