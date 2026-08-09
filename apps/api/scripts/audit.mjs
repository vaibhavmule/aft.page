#!/usr/bin/env node
/**
 * Prod hijack CIL: POST ops /api/audit/run (same SMOKE_SECRET).
 * Scanner junk is npm run audit:security.
 */
const secret = (process.env.SMOKE_SECRET || "").trim();
if (!secret) {
  console.error("SMOKE_SECRET is required");
  process.exit(1);
}
const base = (process.env.AUDIT_URL || "https://ops.aft.page/api/audit/run").trim();

const res = await fetch(base, {
  method: "POST",
  headers: { authorization: `Bearer ${secret}` },
  signal: AbortSignal.timeout(120_000),
});
let body;
try {
  body = await res.json();
} catch {
  console.error(`audit http ${res.status} (non-json)`);
  process.exit(1);
}
console.log(JSON.stringify(body, null, 2));
if (!res.ok || !body?.ok) process.exit(1);
