import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const dir = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(dir, "ensure-runtime.ts"), "utf8");
assert.match(src, /export async function ensureRuntime/);
assert.match(src, /ensureRuby/);
assert.match(src, /ensureElixir/);
assert.match(src, /ensurePythonPip/);
assert.match(src, /ensureNode/);
console.log("ok");
