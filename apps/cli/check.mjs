/** Assert-based self-check for CLI helpers. */
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { shouldSkip } from "./src/deploy.js";
import { DEFAULT_API, apiBase } from "./src/api.js";
import { detectProject } from "./src/detect.js";
import { readAftJsonSlug } from "./src/state.js";
import { resolveDeployTarget, readSlugHint } from "./src/resolve.js";
import { sanitizeSlug } from "./src/slug.js";
import { ensureAftJson } from "./src/init.js";
import { isInteractive } from "./src/prompt.js";
import { cmpVersion, localVersion } from "./src/version.js";

assert.equal(shouldSkip("node_modules/x"), true);
assert.equal(shouldSkip(".git/config"), true);
assert.equal(shouldSkip(".aft/state.json"), true);
assert.equal(shouldSkip(".env"), true);
assert.equal(shouldSkip(".env.local"), true);
assert.equal(shouldSkip(".DS_Store"), true);
assert.equal(shouldSkip("index.html"), false);
assert.equal(shouldSkip("dist/index.html"), false);
assert.equal(DEFAULT_API, "https://api.aft.page");

const prev = process.env.AFT_API;
process.env.AFT_API = "https://api.example.test/";
assert.equal(apiBase(), "https://api.example.test");
if (prev === undefined) delete process.env.AFT_API;
else process.env.AFT_API = prev;

const root = dirname(fileURLToPath(import.meta.url));
const help = spawnSync(process.execPath, [join(root, "bin/aft.js"), "--help"], {
  encoding: "utf8",
});
assert.equal(help.status, 0, help.stderr);
assert.match(help.stdout, /aft deploy/);
assert.match(help.stdout, /No login/);
assert.match(help.stdout, /aft login/);
assert.match(help.stdout, /aft rename/);
assert.match(help.stdout, /aft env/);
assert.match(help.stdout, /aft visibility/);
assert.match(help.stdout, /aft sites/);
assert.match(help.stdout, /aft rollback/);
assert.match(help.stdout, /aft update/);
assert.match(help.stdout, /v0\.2\.0/);

assert.equal(cmpVersion("0.1.0", "0.2.0"), -1);
assert.equal(cmpVersion("0.2.0", "0.2.0"), 0);
assert.equal(cmpVersion("0.3.0", "0.2.0"), 1);
assert.equal(localVersion(), "0.2.0");

const envHelp = spawnSync(
  process.execPath,
  [join(root, "bin/aft.js"), "env", "list"],
  { encoding: "utf8" },
);
assert.notEqual(envHelp.status, 0);
assert.match(envHelp.stderr, /Not logged in|aft login/);

assert.equal(await readAftJsonSlug(join(root, "nope-missing")), null);

assert.equal(sanitizeSlug("My Cool App"), "my-cool-app");
assert.equal(sanitizeSlug("my-app"), "my-app");
assert.equal(
  sanitizeSlug("Include XI — Intelligence that sells. Systems that scale."),
  "include-xi-intelligence-that-sells-systems-that",
);

assert.equal(isInteractive(), Boolean(process.stdin.isTTY && process.stdout.isTTY));

const tmp = await mkdtemp(join(tmpdir(), "aft-cli-"));
const project = join(tmp, "demo-app");
await mkdir(project);
await writeFile(
  join(project, "package.json"),
  JSON.stringify({
    name: "demo-app",
    scripts: { build: "echo ok" },
    devDependencies: { vite: "5.0.0" },
  }),
);
await mkdir(join(project, "dist"));
await writeFile(join(project, "dist", "index.html"), "<title>Demo</title>\n");
const picked = await resolveDeployTarget(project, ".");
assert.equal(picked.deployRoot, join(project, "dist"));
assert.equal(picked.projectRoot, project);
assert.equal(await readSlugHint(project), "demo-app");
const viteDet = await detectProject(project);
assert.equal(viteDet.framework, "vite");
assert.equal(viteDet.outDir, "dist");

const needs = join(tmp, "needs-build");
await mkdir(needs);
await writeFile(
  join(needs, "package.json"),
  JSON.stringify({
    name: "needs-build",
    scripts: { build: "echo ok" },
    dependencies: { vite: "5.0.0" },
  }),
);
await mkdir(join(needs, "src"));
const needTarget = await resolveDeployTarget(needs, ".");
assert.equal(needTarget.needsBuild, true);

const plain = join(tmp, "plain-site");
await mkdir(plain);
await writeFile(join(plain, "index.html"), "<h1>hi</h1>\n");
assert.equal(await ensureAftJson(plain, { interactive: false }), "plain-site");
assert.equal(await ensureAftJson(plain, { interactive: false }), null);
const plainAft = JSON.parse(
  await import("node:fs/promises").then((fs) =>
    fs.readFile(join(plain, "aft.json"), "utf8"),
  ),
);
assert.equal(plainAft.runtime, "static");

const nextDir = join(tmp, "next-app");
await mkdir(nextDir);
await writeFile(
  join(nextDir, "package.json"),
  JSON.stringify({ name: "next-app", dependencies: { next: "15.0.0" } }),
);
await writeFile(join(nextDir, "next.config.mjs"), "export default {}\n");
const nextDet = await detectProject(nextDir);
assert.equal(nextDet.framework, "next-ssr");
assert.equal(nextDet.runtime, "next");

const install = await import("node:fs").then((fs) =>
  fs.readFileSync(join(root, "../../www/install.sh"), "utf8"),
);
assert.match(install, /aft\.page\/cli/);
assert.match(install, /curl -fsSL/);
assert.match(install, /src\/env\.js/);
assert.match(install, /src\/visibility\.js/);
assert.match(install, /src\/detect\.js/);
assert.match(install, /src\/prompt\.js/);
assert.match(install, /src\/update\.js/);
assert.match(install, /src\/version\.js/);
assert.match(install, /src\/analytics\.js/);
assert.match(install, /VERSION/);

console.log("ok");
