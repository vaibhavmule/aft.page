#!/usr/bin/env node
/**
 * Run qa/ suites (mail + pages + browser-sec).
 * Hijack CIL is separate: cd apps/api && npm run audit
 */
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));

const suites = [
  ["email-auth", join(dir, "email-auth/check.mjs")],
  ["pages", join(dir, "pages/check.mjs")],
  ["browser-sec", join(dir, "browser-sec/check.mjs")],
];

let failed = 0;
for (const [name, script] of suites) {
  console.log(`\n── ${name} ──`);
  const r = spawnSync(process.execPath, [script, ...process.argv.slice(2)], {
    stdio: "inherit",
    env: process.env,
  });
  if (r.status !== 0) failed++;
}

console.log(
  `\nHijack CIL (security ship gate): cd apps/api && npm run audit`,
);
console.log(`Scanner ritual: cd apps/api && npm run audit:security`);

if (failed) {
  console.error(`\n${failed}/${suites.length} qa suites failed`);
  process.exit(1);
}
console.log(`\nok qa ${suites.length}/${suites.length}`);
