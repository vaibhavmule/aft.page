#!/usr/bin/env node
/** Assert-based self-check. No live GitHub / deploy. */
import assert from "node:assert/strict";
import { detectFromManifest, probeSlug, skipReason } from "./detect.mjs";
import { capCheck, MAX_FILE_BYTES, MAX_FILES, MAX_TOTAL_BYTES } from "./limits.mjs";

assert.equal(probeSlug(1), "test--fw-1");
assert.equal(probeSlug(5), "test--fw-5");

const vite = detectFromManifest({
  pkg: { dependencies: { vite: "^6", react: "^19" }, scripts: { build: "vite build" } },
  files: ["vite.config.ts", "package.json"],
});
assert.equal(vite.framework, "vite");
assert.equal(vite.staticDeployable, true);
assert.equal(vite.outDir, "dist");
assert.equal(vite.buildScript, "build");
assert.equal(skipReason({ size: 100, stargazers_count: 80 }, vite), null);

const nextExport = detectFromManifest({
  pkg: { dependencies: { next: "15" }, scripts: { build: "next build" } },
  files: ["next.config.mjs", "package.json"],
  configTexts: { "next.config.mjs": "export default { output: 'export' }" },
});
assert.equal(nextExport.framework, "next-static");
assert.equal(nextExport.staticDeployable, true);
assert.equal(skipReason({ size: 200, stargazers_count: 40 }, nextExport), null);

const nextSsr = detectFromManifest({
  pkg: { dependencies: { next: "15" }, scripts: { build: "next build" } },
  files: ["next.config.js", "package.json"],
  configTexts: { "next.config.js": "module.exports = {}" },
});
assert.equal(nextSsr.framework, "next-ssr");
assert.equal(nextSsr.staticDeployable, false);
assert.equal(skipReason({ size: 200, stargazers_count: 40 }, nextSsr), "next_ssr");

const html = detectFromManifest({ pkg: null, files: ["index.html"] });
assert.equal(html.framework, "static");
assert.equal(html.needsBuild, false);
assert.equal(skipReason({ size: 12, stargazers_count: 20 }, html), null);

const mono = detectFromManifest({
  pkg: { workspaces: ["apps/*"], scripts: { build: "turbo" } },
  files: ["package.json"],
});
assert.equal(mono.skip, "monorepo");
assert.equal(skipReason({ size: 100, stargazers_count: 50 }, mono), "monorepo");

const empty = detectFromManifest({ pkg: null, files: ["README.md"] });
assert.equal(skipReason({ size: 10, stargazers_count: 30 }, empty), "no_package_and_no_index");

assert.equal(skipReason({ size: 9000, stargazers_count: 50 }, vite), "too_large");
assert.equal(skipReason({ size: 100, stargazers_count: 80_000 }, vite), "mega_repo");

const astro = detectFromManifest({
  pkg: { dependencies: { astro: "^5" }, scripts: { build: "astro build" } },
  files: ["astro.config.mjs", "package.json"],
});
assert.equal(astro.framework, "astro");
assert.equal(astro.outDir, "dist");

const svelteSsr = detectFromManifest({
  pkg: { dependencies: { "@sveltejs/kit": "^2" }, scripts: { build: "vite build" } },
  files: ["package.json"],
});
assert.equal(skipReason({ size: 80, stargazers_count: 40 }, svelteSsr), "sveltekit_ssr");

const noBuild = detectFromManifest({
  pkg: { dependencies: { vite: "^6" }, scripts: { dev: "vite" } },
  files: ["vite.config.ts", "package.json"],
});
assert.equal(skipReason({ size: 80, stargazers_count: 40 }, noBuild), "no_build_script");

assert.equal(capCheck([{ path: "index.html", bytes: 100 }]).ok, true);
assert.equal(capCheck(Array.from({ length: MAX_FILES + 1 }, (_, i) => ({ path: `${i}.js`, bytes: 1 }))).reason, "too_big");
assert.equal(capCheck([{ path: "huge.bin", bytes: MAX_FILE_BYTES + 1 }]).reason, "too_big");
assert.equal(
  capCheck([
    { path: "a.js", bytes: MAX_TOTAL_BYTES / 2 + 1 },
    { path: "b.js", bytes: MAX_TOTAL_BYTES / 2 + 1 },
  ]).reason,
  "too_big",
);

console.log("ok");
