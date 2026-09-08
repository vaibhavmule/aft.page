/**
 * Homepage smoke check — race + live dropzone + ways-in index.
 * Guards the actual homepage composition; the old terminal demo was retired.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(dir, "index.html"), "utf8");
const js = readFileSync(join(dir, "deploy.js"), "utf8");

// The hero is a two-lane race + a live dropzone + the ways-in index.
for (const needle of [
  'class="home-race"',
  'class="home-race-head"',
  'class="home-lane home-lane-old"',
  'class="home-lane home-lane-aft"',
  'id="hero-drop"',
  'id="paste-form"',
  'id="folder-input"',
  'id="file-input"',
  'id="paste-drop"',
  'id="paste-status"',
  'class="path-row home-path-row"',
  'href="/mcp"',
  'href="/install"',
  'href="/drop"',
  'href="/run/"',
  "aft deploy",
]) {
  if (!html.includes(needle)) throw new Error(`index.html missing ${needle}`);
}

// No dead claims: the homepage no longer marks Run as "coming soon" and the
// old terminal demo has been retired.
if (html.includes("coming soon") || html.includes("CLI next")) {
  throw new Error("index.html still marks CLI as coming soon");
}

// -----------------------------------------------
// Verify the hero race + dropzone mirror each other.
// -----------------------------------------------
if (html.includes("data-hero-demo") || html.includes("data-demo-tab")) {
  throw new Error("index.html still has retired hero-demo markup");
}

// deploy.js must no longer carry the retired terminal-demo tab/typewriter code.
for (const needle of [
  "selectDemoTab",
  "copyDemoSnippet",
  "typeCliDemo",
  "demoTabFromHash",
  "DEMO_CODE_IDS",
  "heroDemo",
]) {
  if (js.includes(needle)) throw new Error(`deploy.js still has retired demo code (${needle})`);
}

// The live drop flow the homepage depends on must still be present.
for (const needle of [
  "paste-form",
  "paste-drop",
  "folder-input",
  "file-input",
  "deployFiles",
  "entriesFromZip",
  "stageFiles",
  "waitlistForm",
]) {
  if (!js.includes(needle)) throw new Error(`deploy.js missing ${needle}`);
}

console.log("hero-demo.check: ok");