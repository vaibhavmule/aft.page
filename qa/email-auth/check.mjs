#!/usr/bin/env node
/**
 * Email auth DNS self-check for aft.page (SPF / DKIM / DMARC / MX).
 * Pure DNS — no browser. Chrome can't see TXT records better than this.
 *
 *   node qa/email-auth/check.mjs
 *   AFT_ROOT=aft.page node qa/email-auth/check.mjs
 */
import assert from "node:assert/strict";
import { resolveMx, resolveTxt } from "node:dns/promises";

const root = (process.env.AFT_ROOT || "aft.page").replace(/\.$/, "");

async function txt(name) {
  try {
    const rows = await resolveTxt(name);
    return rows.map((parts) => parts.join(""));
  } catch (err) {
    if (err && (err.code === "ENODATA" || err.code === "ENOTFOUND")) return [];
    throw err;
  }
}

function find(records, re) {
  return records.find((r) => re.test(r)) || null;
}

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

await check("MX → Google", async () => {
  const mx = await resolveMx(root);
  assert.ok(mx.length, "no MX");
  assert.ok(
    mx.some((r) => /google\.com\.?$/i.test(r.exchange)),
    `expected google MX, got ${mx.map((r) => r.exchange).join(", ")}`,
  );
});

await check("SPF (Google Workspace)", async () => {
  const records = await txt(root);
  const spf = find(records, /^v=spf1\b/i);
  assert.ok(spf, `no SPF TXT on ${root}`);
  assert.match(spf, /include:_spf\.google\.com/i);
  assert.match(spf, /[~-]all\b/);
});

await check("DMARC reject + strict alignment", async () => {
  const records = await txt(`_dmarc.${root}`);
  const dmarc = find(records, /^v=DMARC1\b/i);
  assert.ok(dmarc, `no DMARC on _dmarc.${root}`);
  assert.match(dmarc, /\bp=reject\b/i);
  assert.match(dmarc, /\baspf=s\b/i);
  assert.match(dmarc, /\badkim=s\b/i);
  assert.match(dmarc, new RegExp(`rua=mailto:hello@${root.replace(/\./g, "\\.")}`, "i"));
});

await check("DKIM google._domainkey (Workspace)", async () => {
  const records = await txt(`google._domainkey.${root}`);
  const dkim = find(records, /^v=DKIM1\b/i);
  assert.ok(dkim, "missing google._domainkey");
  assert.match(dkim, /\bp=[A-Za-z0-9+/]+=*\b/);
});

await check("DKIM cf2024-1._domainkey (Cloudflare Email Sending)", async () => {
  const records = await txt(`cf2024-1._domainkey.${root}`);
  const dkim = find(records, /^v=DKIM1\b/i);
  assert.ok(dkim, "missing cf2024-1._domainkey (claim@ mail)");
  assert.match(dkim, /\bp=[A-Za-z0-9+/]+=*\b/);
});

if (failures.length) {
  console.error(`\n${failures.length} failed: ${failures.join(", ")}`);
  process.exit(1);
}
console.log(`\nok email-auth ${root}`);
