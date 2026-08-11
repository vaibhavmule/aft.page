/** Assert-based self-check for CLI helpers. */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { shouldSkip } from "./src/deploy.js";
import { DEFAULT_API, apiBase } from "./src/api.js";
import { readAftJsonSlug } from "./src/state.js";

assert.equal(shouldSkip("node_modules/x"), true);
assert.equal(shouldSkip(".git/config"), true);
assert.equal(shouldSkip(".aft/state.json"), true);
assert.equal(shouldSkip(".env"), true);
assert.equal(shouldSkip(".env.local"), true);
assert.equal(shouldSkip(".DS_Store"), true);
assert.equal(shouldSkip("index.html"), false);
assert.equal(shouldSkip("dist/index.html"), false);
assert.equal(DEFAULT_API, "https://api.aft.page");

const prev = process.env.AFT_API;
process.env.AFT_API = "https://api.example.test/";
assert.equal(apiBase(), "https://api.example.test");
if (prev === undefined) delete process.env.AFT_API;
else process.env.AFT_API = prev;

const root = dirname(fileURLToPath(import.meta.url));
const help = spawnSync(process.execPath, [join(root, "bin/aft.js"), "--help"], {
  encoding: "utf8",
});
assert.equal(help.status, 0, help.stderr);
assert.match(help.stdout, /aft login/);
assert.match(help.stdout, /aft deploy/);

assert.equal(await readAftJsonSlug(join(root, "nope-missing")), null);

const install = await import("node:fs").then((fs) =>
  fs.readFileSync(join(root, "../../www/install.sh"), "utf8"),
);
assert.match(install, /aft\.page\/cli/);
assert.match(install, /curl -fsSL/);

console.log("ok");
