#!/usr/bin/env node
/**
 * Browser-visible security gates (deterministic HTTP — no Passmark/AI).
 *
 *   node qa/browser-sec/check.mjs
 *
 * Env overrides:
 *   AFT_ROOT              default https://aft.page
 *   AFT_QA_PUBLIC_SLUG    default test--html (junk-path host)
 *   AFT_QA_PRIVATE_SLUG   default test--priv (must stay private)
 */
import assert from "node:assert/strict";

const ROOT = (process.env.AFT_ROOT || "https://aft.page").replace(/\/$/, "");
const rootHost = new URL(ROOT).hostname;
const PUBLIC_SLUG = process.env.AFT_QA_PUBLIC_SLUG || "test--html";
const PRIVATE_SLUG = process.env.AFT_QA_PRIVATE_SLUG || "test--priv";

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

await check("junk-path 404 on public canary", async () => {
  const url = `https://${PUBLIC_SLUG}.${rootHost}/.git/config`;
  const res = await fetch(url, {
    redirect: "manual",
    headers: { "user-agent": "aft-qa/browser-sec" },
  });
  assert.equal(res.status, 404, `${url} → ${res.status}`);
  const body = await res.text();
  assert.ok(!/repositoryformatversion|gitdir/i.test(body), "git config leak");
});

await check("private canary → login, no body leak", async () => {
  const url = `https://${PRIVATE_SLUG}.${rootHost}/`;
  const res = await fetch(url, {
    redirect: "manual",
    headers: {
      accept: "text/html",
      "user-agent": "aft-qa/browser-sec",
    },
  });
  assert.equal(res.status, 302, `${url} → ${res.status}`);
  const loc = res.headers.get("location") || "";
  assert.match(loc, /\/login\?next=/);
  assert.ok(
    loc.includes(encodeURIComponent(url)) || loc.includes(PRIVATE_SLUG),
    `next missing: ${loc}`,
  );
  const body = await res.text();
  assert.equal(body.length, 0, `body leak (${body.length} bytes)`);
  assert.ok(!body.includes("MARKER") && !/-priv/.test(body), "content leak");
});

await check("ops logged-out → login (not inventory)", async () => {
  const url = `https://ops.${rootHost}/`;
  const res = await fetch(url, {
    redirect: "manual",
    headers: { "user-agent": "aft-qa/browser-sec" },
  });
  assert.equal(res.status, 302, `${url} → ${res.status}`);
  const loc = res.headers.get("location") || "";
  assert.match(loc, new RegExp(`${rootHost.replace(/\./g, "\\.")}/login\\?next=`));
  assert.ok(loc.includes("ops."), `ops next: ${loc}`);
  const body = await res.text();
  assert.ok(!/smoke|inventory|sites/i.test(body), "ops body leak");
});

if (failures.length) {
  console.error(`\n${failures.length} failed: ${failures.join(", ")}`);
  process.exit(1);
}
console.log(`\nok browser-sec ${ROOT}`);
