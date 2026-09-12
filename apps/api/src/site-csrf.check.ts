import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const life = readFileSync(join(here, "lifecycle.ts"), "utf8");

assert.match(life, /originMayActOnSlug\(request, targetSlug/);
assert.match(life, /originMayActOnSlug\(request, slug/);
assert.ok(
  /async function getCaps[\s\S]*authorizeDeployUpdate\(env, request, slug\)/.test(
    life,
  ),
  "GET capabilities must require a site credential",
);
assert.ok(
  /async function approveCaps[\s\S]*originMayActOnSlug\(request, slug/.test(life),
  "POST capabilities must reject other tenant origins",
);
assert.ok(
  /async function absorbSite[\s\S]*originMayActOnSlug\(request, targetSlug/.test(
    life,
  ),
  "POST absorb must reject other tenant origins",
);

console.log("ok");
