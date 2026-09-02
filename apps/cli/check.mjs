/** Assert-based self-check for CLI helpers. */
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ensureDeployable, shouldSkip } from "./src/deploy.js";
import { DEFAULT_API, apiBase } from "./src/api.js";
import { adviseLocal } from "./src/preflight.js";
import { detectProject, detectFromSignals } from "./src/detect.js";
import { readAftJsonSlug } from "./src/state.js";
import { resolveDeployTarget, readSlugHint } from "./src/resolve.js";
import { sanitizeSlug } from "./src/slug.js";
import { ensureAftJson } from "./src/init.js";
import { isInteractive } from "./src/prompt.js";
import { cmpVersion, localVersion } from "./src/version.js";
import { filterMigrateKeys, parseDotEnv } from "./src/migrate.js";
import { domainPhase, needsDns } from "./src/domains.js";
import { nextVersionUnsupported } from "./src/next-deploy.js";

assert.equal(shouldSkip("node_modules/x"), true);
assert.equal(shouldSkip(".git/config"), true);
assert.equal(shouldSkip(".aft/state.json"), true);
assert.equal(shouldSkip(".npm/_cacache/x"), true);
assert.equal(shouldSkip(".env"), true);
assert.equal(shouldSkip(".env.local"), true);
assert.equal(shouldSkip(".DS_Store"), true);
assert.equal(shouldSkip("index.html"), false);
assert.equal(shouldSkip("dist/index.html"), false);
assert.equal(DEFAULT_API, "https://api.aft.page");

assert.equal(
  adviseLocal({ runtime: "next", staticDeployable: false }).error,
  "needs_next_build",
);
assert.equal(
  adviseLocal({ runtime: "next", staticDeployable: false }).action,
  "run_next",
);
assert.equal(
  adviseLocal({ runtime: "container", framework: "django" }).error,
  "needs_container",
);
assert.equal(
  adviseLocal({ runtime: "not_a_site", framework: "not-a-site", label: "Celery" })
    .error,
  "not_a_site",
);
assert.equal(
  adviseLocal({ needsBuild: true, buildScript: "build" }).action,
  "run_build",
);
assert.equal(adviseLocal({ hasIndexHtml: true, fileCount: 3 }).ok, true);

process.env.AFT_PREFLIGHT = "0";

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
assert.match(help.stdout, /v0.2.12/);
assert.match(help.stdout, /aft migrate vercel/);
assert.match(help.stdout, /aft domains/);
assert.match(help.stdout, /--check/);
assert.match(help.stdout, /--verbose/);
assert.match(help.stdout, /aft version/);

assert.equal(nextVersionUnsupported("14.2.5"), true);
assert.equal(nextVersionUnsupported("14.1.0"), true);
assert.equal(nextVersionUnsupported(""), true);
assert.equal(nextVersionUnsupported("15.5.21"), true);
assert.equal(nextVersionUnsupported("15.5.24"), false);
assert.equal(nextVersionUnsupported("16.2.11"), true);
assert.equal(nextVersionUnsupported("16.3.3"), false);
assert.equal(nextVersionUnsupported("17.0.0"), false);

assert.equal(cmpVersion("0.1.0", "0.2.2"), -1);
assert.equal(cmpVersion("0.2.2", "0.2.2"), 0);
assert.equal(cmpVersion("0.3.0", "0.2.2"), 1);
assert.equal(localVersion(), "0.2.12");

const versionCmd = spawnSync(process.execPath, [join(root, "bin/aft.js"), "version"], {
  encoding: "utf8",
});
assert.equal(versionCmd.status, 0, versionCmd.stderr);
assert.equal(versionCmd.stdout.trim(), "0.2.12");

const envHelp = spawnSync(
  process.execPath,
  [join(root, "bin/aft.js"), "env", "list"],
  { encoding: "utf8" },
);
assert.notEqual(envHelp.status, 0);
assert.match(envHelp.stderr, /Not logged in|aft login|No project slug/);

// Lane banner: hosted CLI must not claim to be the OSS self-hosted deployer.
const bannerRun = spawnSync(process.execPath, [join(root, "bin/aft.js"), "version"], {
  encoding: "utf8",
});
assert.equal(bannerRun.status, 0, bannerRun.stderr);
assert.match(bannerRun.stderr, /aft\.page/);
assert.match(bannerRun.stderr, /hosted/);
const noBannerRun = spawnSync(
  process.execPath,
  [join(root, "bin/aft.js"), "--no-banner", "version"],
  { encoding: "utf8" },
);
assert.equal(noBannerRun.status, 0, noBannerRun.stderr);
assert.doesNotMatch(noBannerRun.stderr, /aft\.page CLI/);

// `aft deploy --help` must print help and exit 0 WITHOUT deploying.
const deployHelp = spawnSync(
  process.execPath,
  [join(root, "bin/aft.js"), "deploy", "--help"],
  { encoding: "utf8", cwd: root },
);
assert.equal(deployHelp.status, 0, deployHelp.stderr);
assert.match(deployHelp.stdout, /aft deploy/);
assert.doesNotMatch(deployHelp.stdout, /Deploying \d+ file/);
const deployH = spawnSync(
  process.execPath,
  [join(root, "bin/aft.js"), "deploy", "-h"],
  { encoding: "utf8", cwd: root },
);
assert.equal(deployH.status, 0, deployH.stderr);
assert.match(deployH.stdout, /aft deploy/);
assert.doesNotMatch(deployH.stdout, /Deploying \d+ file/);

// `aft deploy --expires 1h` must pass the flag through to the API.
const deployExpires = spawnSync(
  process.execPath,
  [join(root, "bin/aft.js"), "deploy", "--help", "--expires", "1h"],
  { encoding: "utf8", cwd: root },
);
assert.equal(deployExpires.status, 0, deployExpires.stderr);
assert.match(deployExpires.stdout, /--expires/);

const domainHelp = spawnSync(
  process.execPath,
  [join(root, "bin/aft.js"), "domain", "--help"],
  { encoding: "utf8" },
);
assert.equal(domainHelp.status, 0, domainHelp.stderr);
assert.match(domainHelp.stdout, /aft domain add/);
assert.match(domainHelp.stdout, /request-access/);

assert.equal(
  domainPhase({ status: "pending", sslStatus: "pending_validation" }),
  "issuing certificate",
);
assert.equal(
  domainPhase({ status: "pending", sslStatus: "pending_issuance" }),
  "installing HTTPS",
);
assert.equal(domainPhase({ status: "active" }), "active");
assert.equal(needsDns({ status: "pending", sslStatus: "pending_validation" }), true);
assert.equal(needsDns({ status: "pending", sslStatus: "pending_issuance" }), false);

assert.equal(await readAftJsonSlug(join(root, "nope-missing")), null);

assert.equal(sanitizeSlug("My Cool App"), "my-cool-app");
assert.equal(sanitizeSlug("my-app"), "my-app");
assert.equal(
  sanitizeSlug("Include XI — Intelligence that sells. Systems that scale."),
  "include-xi-intelligence-that-sells-systems-that",
);

assert.deepEqual(parseDotEnv('FOO=bar\n# c\nBAZ="x y"\n'), {
  FOO: "bar",
  BAZ: "x y",
});
assert.equal(
  filterMigrateKeys([
    ["OPENROUTER_API_KEY", "sk"],
    ["VERCEL_URL", "x.vercel.app"],
    ["TURBO_CACHE", "1"],
  ]).length,
  1,
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

// Absolute path dirArg must behave identically to a relative one.
const absPicked = await resolveDeployTarget(join(tmp, "elsewhere"), project);
assert.equal(absPicked.deployRoot, join(project, "dist"));
assert.equal(absPicked.projectRoot, project);
const viteDet = await detectProject(project);
assert.equal(viteDet.framework, "vite");
assert.equal(viteDet.outDir, "dist");

// Vite source index.html at repo root must not win over dist/.
await writeFile(join(project, "index.html"), "<div id=app></div>\n");
const viteRootIndex = await resolveDeployTarget(project, ".");
assert.equal(viteRootIndex.deployRoot, join(project, "dist"));
assert.notEqual(viteRootIndex.needsBuild, true);

const viteSrcOnly = join(tmp, "vite-src-only");
await mkdir(join(viteSrcOnly, "src"), { recursive: true });
await writeFile(
  join(viteSrcOnly, "package.json"),
  JSON.stringify({
    name: "vite-src-only",
    scripts: { build: "echo ok" },
    devDependencies: { vite: "5.0.0" },
  }),
);
await writeFile(join(viteSrcOnly, "index.html"), "<div id=app></div>\n");
const viteNeeds = await resolveDeployTarget(viteSrcOnly, ".");
assert.equal(viteNeeds.needsBuild, true);
assert.equal(viteNeeds.deployRoot, viteSrcOnly);

const bot = join(tmp, "slack-bot");
await mkdir(bot);
await writeFile(
  join(bot, "package.json"),
  JSON.stringify({
    name: "slack-bot",
    dependencies: { "@slack/bolt": "4.0.0" },
  }),
);
await writeFile(join(bot, "index.js"), "console.log('bot')\n");
const botTarget = await resolveDeployTarget(bot, ".");
assert.notEqual(botTarget.needsBuild, true);
await assert.rejects(() => ensureDeployable(bot, "."), /index\.html/);

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

// Absolute path to a plain static folder resolves the same as cwd would.
const absPlain = await resolveDeployTarget(join(tmp, "elsewhere"), plain);
assert.equal(absPlain.deployRoot, plain);
assert.equal(absPlain.projectRoot, plain);

// Repo-root guard: a git repo root with 500+ files must be refused, not uploaded.
const repoRoot = join(tmp, "repo-root");
await mkdir(repoRoot);
await writeFile(join(repoRoot, ".git"), "gitdir: ../real-git\n");
await writeFile(join(repoRoot, "package.json"), JSON.stringify({ name: "repo-root" }));
await writeFile(join(repoRoot, "index.html"), "<h1>repo</h1>\n");
for (let i = 0; i < 520; i++) {
  await writeFile(join(repoRoot, `f${i}.txt`), "x\n");
}
const repoAdvice = await ensureDeployable(repoRoot, ".", { checkOnly: true });
assert.equal(repoAdvice.advice.ok, false);
assert.equal(repoAdvice.advice.error, "repo_root_upload");
assert.match(repoAdvice.advice.fix, /dist/);
await assert.rejects(
  () => ensureDeployable(repoRoot, ".", { interactive: false }),
  /repo_root_upload|dist|built output/,
);

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
const nextCheck = await ensureDeployable(nextDir, ".", { checkOnly: true });
assert.equal(nextCheck.advice.action, "run_next");
assert.equal(nextCheck.advice.error, "needs_next_build");

assert.equal(
  detectFromSignals({ pkg: { dependencies: { express: "4" } }, hasIndexHtml: true })
    .kind,
  "container",
);
assert.equal(
  detectFromSignals({ requirementsTxt: "flask>=3\n" }).stack,
  "Flask",
);
assert.equal(
  detectFromSignals({ requirementsTxt: "celery==5\n" }).kind,
  "not_a_site",
);
assert.equal(
  detectFromSignals({ gemfile: "gem 'rails'\n" }).stack,
  "Rails",
);
assert.equal(
  detectFromSignals({ cargoToml: "axum = \"0.7\"\n" }).stack,
  "Axum",
);
assert.equal(
  detectFromSignals({
    goMod: "require github.com/gin-gonic/gin v1\n",
  }).stack,
  "Gin",
);
assert.equal(
  detectFromSignals({ pkg: { dependencies: { ioredis: "5" } } }).kind,
  "not_a_site",
);
assert.equal(
  detectFromSignals({
    hasDockerfile: true,
    pkg: { dependencies: { next: "15" } },
  }).stack,
  "Docker",
);
assert.equal(
  detectFromSignals({
    pkg: { devDependencies: { vite: "5" } },
    hasIndexHtml: true,
  }).kind,
  "static_build",
);
const { buildPlanFromSignals } = await import("./src/detect.js");
assert.equal(
  buildPlanFromSignals({ hasUvLock: true, requirementsTxt: "flask>=3\n" }).install,
  "uv sync",
);

const install = await import("node:fs").then((fs) =>
  fs.readFileSync(join(root, "../../www/install.sh"), "utf8"),
);
assert.match(install, /aft\.page\/cli/);
assert.match(install, /curl -fsSL/);
assert.match(install, /src\/env\.js/);
assert.match(install, /src\/visibility\.js/);
assert.match(install, /src\/detect\.js/);
assert.match(install, /src\/preflight\.js/);
assert.match(install, /src\/prompt\.js/);
assert.match(install, /src\/update\.js/);
assert.match(install, /src\/version\.js/);
assert.match(install, /src\/analytics\.js/);
assert.match(install, /src\/domains\.js/);
assert.match(install, /src\/migrate\.js/);
assert.match(install, /src\/site-url\.js/);
assert.match(install, /VERSION/);

console.log("ok");
