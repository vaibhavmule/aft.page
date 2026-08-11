#!/usr/bin/env node
/**
 * Render-check every public page via Cloudflare Browser Rendering (/content).
 *
 * Needs:
 *   CLOUDFLARE_ACCOUNT_ID   (defaults to Vaibhav aft account)
 *   CLOUDFLARE_API_TOKEN    with permission: Browser Rendering — Edit
 *
 * Fallback without token:
 *   AFT_QA_MODE=fetch node qa/pages/check.mjs   # plain HTTP, no Chrome
 *
 *   node qa/pages/check.mjs
 *   node qa/pages/check.mjs /drop/ /mcp
 */
import assert from "node:assert/strict";
import {
  API,
  MUST_NOT_GLOBAL,
  PAGES,
  ROOT,
} from "./manifest.mjs";

const ACCOUNT =
  process.env.CLOUDFLARE_ACCOUNT_ID || "44255ec64e0080b678670b53bf810d27";
const TOKEN = process.env.CLOUDFLARE_API_TOKEN || "";
const MODE =
  process.env.AFT_QA_MODE || (TOKEN ? "browser" : "fetch");
const CONCURRENCY = Number(process.env.AFT_QA_CONCURRENCY || 2);

const only = process.argv.slice(2).filter((a) => !a.startsWith("-"));
const cases = only.length
  ? PAGES.filter((p) => only.some((o) => p.path === o || p.path.startsWith(o)))
  : PAGES;

if (!cases.length) {
  console.error("no matching pages");
  process.exit(2);
}

function urlFor(page) {
  const base = page.base === "api" ? API : ROOT;
  return new URL(page.path, base.endsWith("/") ? base : base + "/").href;
}

async function fetchBody(url) {
  const res = await fetch(url, {
    redirect: "follow",
    headers: { "user-agent": "aft-qa/0.1 (+https://aft.page)" },
  });
  const body = await res.text();
  return { status: res.status, body };
}

async function browserContent(url) {
  const endpoint = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/browser-rendering/content`;
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      authorization: `Bearer ${TOKEN}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      url,
      gotoOptions: { waitUntil: "domcontentloaded", timeout: 30000 },
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.success || typeof data.result !== "string") {
    const err =
      data?.errors?.[0]?.message ||
      data?.messages?.[0]?.message ||
      `HTTP ${res.status}`;
    throw new Error(`browser-rendering: ${err}`);
  }
  return { status: 200, body: data.result };
}

async function load(page) {
  const url = urlFor(page);
  const mode = page.mode || MODE;
  if (mode === "browser") {
    if (!TOKEN) {
      throw new Error(
        "CLOUDFLARE_API_TOKEN required for browser mode (Browser Rendering — Edit)",
      );
    }
    return { url, mode, ...(await browserContent(url)) };
  }
  return { url, mode, ...(await fetchBody(url)) };
}

function assertPage(page, { url, status, body }) {
  assert.ok(status >= 200 && status < 400, `${url} status ${status}`);
  const minLen = page.minLen ?? 20;
  assert.ok(body && body.length >= minLen, `${url} empty body (${body?.length ?? 0})`);
  for (const bad of [...MUST_NOT_GLOBAL, ...(page.mustNot || [])]) {
    assert.ok(!body.includes(bad), `${url} contains "${bad}"`);
  }
  for (const needle of page.must || []) {
    assert.ok(
      body.toLowerCase().includes(needle.toLowerCase()),
      `${url} missing "${needle}"`,
    );
  }
}

async function mapPool(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx], idx);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => worker()),
  );
  return out;
}

if (MODE === "browser") {
  console.log(`mode=browser account=${ACCOUNT} pages=${cases.length}`);
} else {
  console.log(
    `mode=fetch pages=${cases.length}${TOKEN ? "" : " (set CLOUDFLARE_API_TOKEN for Chrome render)"}`,
  );
}

const failures = [];
await mapPool(cases, CONCURRENCY, async (page) => {
  const label = `${page.base === "api" ? "api" : "www"}${page.path}`;
  try {
    const got = await load(page);
    assertPage(page, got);
    console.log(`ok  ${got.mode.padEnd(7)} ${label}`);
  } catch (err) {
    failures.push(label);
    console.error(`FAIL ${label}: ${err.message}`);
  }
});

if (failures.length) {
  console.error(`\n${failures.length}/${cases.length} failed`);
  process.exit(1);
}
console.log(`\nok pages ${cases.length}/${cases.length} (${MODE})`);
