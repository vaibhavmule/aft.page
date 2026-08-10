#!/usr/bin/env node
// ponytail: assert the install surface `npx plugins` actually reads.
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const root = dirname(fileURLToPath(import.meta.url));
const repo = join(root, "../..");
const plugin = JSON.parse(readFileSync(join(root, "plugin.json"), "utf8"));
const vendor = JSON.parse(readFileSync(join(root, ".plugin/plugin.json"), "utf8"));
const mcp = JSON.parse(readFileSync(join(root, "mcp.json"), "utf8"));
const dotMcp = JSON.parse(readFileSync(join(root, ".mcp.json"), "utf8"));
const market = JSON.parse(readFileSync(join(repo, "marketplace.json"), "utf8"));

assert.equal(plugin.name, "aft-page");
assert.ok(plugin.version);
assert.ok(plugin.description);
assert.equal(plugin.repository, "https://github.com/vaibhavmule/aft.page");
assert.equal(vendor.name, plugin.name);
assert.equal(vendor.version, plugin.version);
assert.equal(mcp.mcpServers["aft-page"].url, "https://mcp.aft.page/mcp");
assert.equal(dotMcp.mcpServers["aft-page"].url, mcp.mcpServers["aft-page"].url);
assert.ok(existsSync(join(root, "skills/deploy-to-aft/SKILL.md")));
assert.equal(market.plugins[0].source, "./apps/plugin");
assert.equal(market.plugins[0].name, "aft-page");

console.log("ok plugin install surface");
