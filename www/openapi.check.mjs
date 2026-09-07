/**
 * One spec, two hosts. api.aft.page serves the discovery surface from
 * ai-discovery.ts at runtime; the apex is static Pages, so the same documents
 * have to be committed here. Prowl and llms.txt-style crawlers register
 * https://aft.page, not the API host, and an unmatched apex path returns the
 * landing page with a 200 — a soft-404 an agent reads as a valid spec.
 *
 *   node openapi.check.mjs           verify the committed files match source
 *   node openapi.check.mjs --write   regenerate them
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
const src = join(dir, "..", "apps", "api", "src", "ai-discovery.ts");
const { mcpManifest, openapiDoc } = await import(src);

const ROOT = "aft.page";
const serialize = (doc) => `${JSON.stringify(doc, null, 2)}\n`;

const artifacts = [
  { path: "openapi.json", body: serialize(openapiDoc(ROOT)) },
  { path: ".well-known/mcp.json", body: serialize(mcpManifest(ROOT)) },
];

const write = process.argv.includes("--write");
const stale = [];

for (const { path, body } of artifacts) {
  const file = join(dir, path);
  if (write) {
    writeFileSync(file, body);
    continue;
  }
  let current;
  try {
    current = readFileSync(file, "utf8");
  } catch {
    stale.push(`${path} is missing`);
    continue;
  }
  if (current !== body) stale.push(`${path} is stale`);
}

if (write) {
  console.log(`openapi.check: wrote ${artifacts.map((a) => a.path).join(", ")}`);
} else if (stale.length) {
  throw new Error(
    `${stale.join("; ")} — apex spec has drifted from apps/api/src/ai-discovery.ts. ` +
      `Run: node www/openapi.check.mjs --write`,
  );
} else {
  console.log("openapi.check: ok (apex matches ai-discovery.ts)");
}
