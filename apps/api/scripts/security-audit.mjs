#!/usr/bin/env node
/**
 * Daily security audit: D1 site_logs junk (all slugs) + optional CF GraphQL.
 * No IPs. ponytail: not a WAF; CF Security Events need a higher plan.
 *
 *   cd apps/api && npm run audit:security
 *   CF_API_TOKEN=… npm run audit:security   # adds last-24h zone paths
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(fileURLToPath(import.meta.url));
const API = join(ROOT, "..");
const ZONE = "c9c40ca61385a6346d90abfc954b44c9";
const DB = "aft-page";

const JUNK_SQL = `SELECT slug, path, status, country, COUNT(*) AS n, MAX(created_at) AS last_at
FROM site_logs
WHERE created_at >= datetime('now', '-1 days')
  AND (lower(path) LIKE '%.git%' OR lower(path) LIKE '%wp-%'
    OR lower(path) LIKE '%.env%' OR lower(path) LIKE '%.php%'
    OR lower(path) LIKE '%xmlrpc%' OR lower(path) LIKE '%phpinfo%'
    OR lower(path) LIKE '%cgi-bin%' OR lower(path) LIKE '%.aws%'
    OR lower(path) LIKE '%@vite%')
GROUP BY slug, path, status, country
ORDER BY last_at DESC
LIMIT 50`;

function tokenFromDevVars() {
  if (process.env.CF_API_TOKEN) return process.env.CF_API_TOKEN.trim();
  try {
    const raw = readFileSync(join(API, ".dev.vars"), "utf8");
    const line = raw.split("\n").find((l) => l.startsWith("CF_API_TOKEN="));
    if (!line) return "";
    return line.slice("CF_API_TOKEN=".length).trim().replace(/^["']|["']$/g, "");
  } catch {
    return "";
  }
}

function d1(sql) {
  const r = spawnSync(
    "npx",
    ["wrangler", "d1", "execute", DB, "--remote", "--json", "--command", sql],
    { cwd: API, encoding: "utf8" },
  );
  if (r.status !== 0) {
    throw new Error(r.stderr || r.stdout || `wrangler exit ${r.status}`);
  }
  const parsed = JSON.parse(r.stdout);
  const batch = Array.isArray(parsed) ? parsed[0] : parsed;
  return batch?.results || [];
}

async function cfGraphql(token, query) {
  const res = await fetch("https://api.cloudflare.com/client/v4/graphql", {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ query }),
    signal: AbortSignal.timeout(30_000),
  });
  const body = await res.json();
  if (!res.ok || body.errors) {
    throw new Error(JSON.stringify(body.errors || body, null, 2));
  }
  return body.data;
}

const day = new Date().toISOString().slice(0, 10);
console.log(`# Security audit ${day}\n`);

const rows = d1(JUNK_SQL);
console.log(`## D1 site_logs junk (last 24h, all slugs)\n`);
if (rows.length === 0) {
  console.log("None.\n");
} else {
  console.log("| slug | path | status | country | n | last |");
  console.log("| --- | --- | --- | --- | --- | --- |");
  for (const r of rows) {
    console.log(
      `| ${r.slug} | \`${r.path}\` | ${r.status} | ${r.country || "—"} | ${r.n} | ${r.last_at} |`,
    );
  }
  console.log("");
}

const public200 = rows.filter((r) => Number(r.status) === 200);
if (public200.length) {
  console.log(
    `**FAIL** ${public200.length} junk path(s) still 200 in owner logs.\n`,
  );
} else {
  console.log("D1: no 200 junk rows in the last 24h (owner logs only).\n");
}

const token = tokenFromDevVars();
if (!token) {
  console.log("CF GraphQL skipped (set CF_API_TOKEN for zone path scan).\n");
  process.exit(public200.length ? 1 : 0);
}

const now = new Date();
const start = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
const end = now.toISOString();
const filter = `datetime_geq: "${start}", datetime_leq: "${end}", requestSource: "eyeball"`;

try {
  const data = await cfGraphql(
    token,
    `query {
      viewer {
        zones(filter: { zoneTag: "${ZONE}" }) {
          hosts: httpRequestsAdaptiveGroups(
            limit: 12
            filter: { ${filter} }
            orderBy: [count_DESC]
          ) { count dimensions { clientRequestHTTPHost } }
          git: httpRequestsAdaptiveGroups(
            limit: 15
            filter: { ${filter}, clientRequestPath_like: "%.git%" }
            orderBy: [count_DESC]
          ) { count dimensions { clientRequestHTTPHost clientRequestPath edgeResponseStatus clientCountryName } }
          env: httpRequestsAdaptiveGroups(
            limit: 15
            filter: { ${filter}, clientRequestPath_like: "%.env%" }
            orderBy: [count_DESC]
          ) { count dimensions { clientRequestHTTPHost clientRequestPath edgeResponseStatus clientCountryName } }
          php: httpRequestsAdaptiveGroups(
            limit: 15
            filter: { ${filter}, clientRequestPath_like: "%.php%" }
            orderBy: [count_DESC]
          ) { count dimensions { clientRequestHTTPHost clientRequestPath edgeResponseStatus clientCountryName } }
          sec: httpRequestsAdaptiveGroups(
            limit: 8
            filter: { ${filter}, clientRequestHTTPHost: "discovra.ai" }
            orderBy: [count_DESC]
          ) { count dimensions { securityAction securitySource } }
        }
      }
    }`,
  );
  const z = data?.viewer?.zones?.[0] || {};
  console.log("## CF zone eyeball (last 24h)\n");
  console.log("| host | count |");
  console.log("| --- | --- |");
  for (const h of z.hosts || []) {
    console.log(`| ${h.dimensions.clientRequestHTTPHost} | ${h.count} |`);
  }
  console.log("\n### .git / .env / .php\n");
  console.log("| host | path | status | country | n |");
  console.log("| --- | --- | --- | --- | --- |");
  let cf200 = 0;
  for (const group of [z.git, z.env, z.php]) {
    for (const row of group || []) {
      const d = row.dimensions;
      if (d.edgeResponseStatus === 200) cf200 += 1;
      console.log(
        `| ${d.clientRequestHTTPHost} | \`${d.clientRequestPath}\` | ${d.edgeResponseStatus} | ${d.clientCountryName} | ${row.count} |`,
      );
    }
  }
  console.log("\n### discovra.ai securityAction\n");
  for (const row of z.sec || []) {
    console.log(
      `- ${row.dimensions.securityAction} / ${row.dimensions.securitySource} × ${row.count}`,
    );
  }
  console.log("");
  if (cf200) {
    console.log(
      `**Note** ${cf200} CF groups still 200 on junk paths (Pages apex or pre-fix Worker).\n`,
    );
  }
} catch (err) {
  console.log(`CF GraphQL failed: ${err instanceof Error ? err.message : err}\n`);
}

process.exit(public200.length ? 1 : 0);
