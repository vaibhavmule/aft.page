/** ponytail: smoke check for static hero snippets + Drop + CLI soon */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(dir, "index.html"), "utf8");
const js = readFileSync(join(dir, "deploy.js"), "utf8");

for (const needle of [
  'data-hero-demo',
  'data-demo-tab="mcp"',
  'data-demo-tab="curl"',
  'data-demo-tab="drop"',
  'data-demo-tab="cli"',
  'id="demo-cli-code"',
  'href="#hero-mcp"',
  'href="#hero-curl"',
  'href="#hero-drop"',
  "coming soon",
]) {
  if (!html.includes(needle)) throw new Error(`index.html missing ${needle}`);
}

if (html.includes("data-demo-run") || html.includes("Run sample")) {
  throw new Error("index.html still has Run demo chrome");
}

for (const needle of [
  "selectDemoTab",
  "copyDemoSnippet",
  "DEMO_CODE_IDS",
  "demoTabFromHash",
]) {
  if (!js.includes(needle)) throw new Error(`deploy.js missing ${needle}`);
}

if (js.includes("runDemoSample") || js.includes("DEMO_HTML")) {
  throw new Error("deploy.js still has Run sample path");
}

console.log("hero-demo.check: ok");
