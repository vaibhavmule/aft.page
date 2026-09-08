#!/usr/bin/env node
/**
 * Browser-visible security gates (deterministic HTTP — no Passmark/AI).
 *
 *   node qa/browser-sec/check.mjs
 *
 * Env overrides:
 *   AFT_ROOT              default https://aft.page
 *   AFT_QA_PUBLIC_SLUG    default hello (junk-path host)
 */
import assert from "node:assert/strict";

const ROOT = (process.env.AFT_ROOT || "https://aft.page").replace(/\/$/, "");
const rootHost = new URL(ROOT).hostname;
const PUBLIC_SLUG = process.env.AFT_QA_PUBLIC_SLUG || "hello";

const failures = [];

async function check(label, fn) {
  try {
    await fn();
    console.log(`ok  ${label}`);
  } catch (err) {
    failures.push(label);
    console.error(`FAIL ${label}: ${err.message}`);
  }
}

await check("junk-path 404 on public site", async () => {
  const url = `https://${PUBLIC_SLUG}.${rootHost}/.git/config`;
  const res = await fetch(url, {
    redirect: "manual",
    headers: { "user-agent": "aft-qa/browser-sec" },
  });
  assert.equal(res.status, 404, `${url} → ${res.status}`);
  const body = await res.text();
  assert.ok(!/repositoryformatversion|gitdir/i.test(body), "git config leak");
});

await check("ops retired stub (410, no inventory)", async () => {
  const url = `https://ops.${rootHost}/`;
  const res = await fetch(url, {
    redirect: "manual",
    headers: { "user-agent": "aft-qa/browser-sec" },
  });
  assert.equal(res.status, 410, `${url} → ${res.status}`);
  const body = await res.text();
  assert.match(body, /retired/i);
  assert.ok(!/inventory|deploy_failures|smoke cases/i.test(body), "ops body leak");
});

if (failures.length) {
  console.error(`\n${failures.length} failed: ${failures.join(", ")}`);
  process.exit(1);
}
console.log(`\nok browser-sec ${ROOT}`);
