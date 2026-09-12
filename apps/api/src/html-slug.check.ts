import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const slugSrc = readFileSync(join(here, "slug.ts"), "utf8");
const claim = readFileSync(join(here, "claim.ts"), "utf8");
const sharing = readFileSync(join(here, "sharing.ts"), "utf8");

assert.match(slugSrc, /export function htmlSafeSlug/);
assert.match(slugSrc, /if \(!slug \|\| !isValidSlug\(slug\)\) return null;/);

assert.ok(claim.includes("htmlSafeSlug("), "claim error HTML must gate slug");
assert.ok(sharing.includes("htmlSafeSlug("), "invite error HTML must gate slug");
assert.ok(claim.includes("${safe}.${root}"));
assert.ok(sharing.includes("${safe}.${root}"));

for (const p of [
  `"><img src=x onerror=alert(1)>`,
  `foo"><script>alert(1)</script>`,
  `javascript:alert(1)`,
]) {
  assert.equal(/^[a-z0-9](?:[a-z0-9-]{0,46}[a-z0-9])?$/.test(p), false, p);
}

console.log("ok");
