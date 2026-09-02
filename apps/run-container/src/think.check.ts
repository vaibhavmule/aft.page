import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("./think.ts", import.meta.url), "utf8");
const models = [...src.matchAll(/"@cf\/zai-org\/glm-[^"]+"/g)].map((m) => m[0]);
assert.equal(models[0], '"@cf/zai-org/glm-4.7-flash"');
assert.equal(models[1], '"@cf/zai-org/glm-5.3-flash"');
console.log("ok");
