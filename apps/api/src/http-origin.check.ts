import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "http.ts"), "utf8");

assert.match(
  src,
  /if \(!host\.endsWith\(`\.\$\{root\}`\)\) return false;/,
  "foreign origins must be denied — cookie-less APIs (connector) are readable cross-site",
);
assert.doesNotMatch(
  src,
  /if \(!host\.endsWith\(`\.\$\{root\}`\)\) return true;/,
);

console.log("http-origin.check ok");
