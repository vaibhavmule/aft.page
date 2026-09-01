/** Local rules + POST /v1/cli/preflight for agent-facing why/fix. */
import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { apiFetch, readJson } from "./api.js";
import { detectProject } from "./detect.js";
import { hasIndexHtml, isRepoRoot, resolveDeployTarget, shouldSkip } from "./resolve.js";
import { localVersion } from "./version.js";

const MAX_FILES = 500;
const MAX_TOTAL_BYTES = 100 * 1024 * 1024;
const MAX_WALK = 501;

/** Same codes as api/src/cli-preflight.ts adviseFromSnapshot. */
export function adviseLocal(s) {
  if (s.deployRootIsRepoRoot && s.fileCount != null && s.fileCount > 500) {
    return {
      ok: false,
      error: "repo_root_upload",
      action: "refuse",
      source: "rules",
      why: "You're at a git repo root with no built output — this would upload the whole repo (likely 500+ files).",
      fix: "Run aft deploy inside a built output folder (dist/, out/, build/), or pass an explicit dir: aft deploy ./dist",
    };
  }
  if (s.runtime === "not_a_site" || s.framework === "not-a-site") {
    return {
      ok: false,
      error: "not_a_site",
      action: "refuse",
      source: "rules",
      why: `${s.label || "This"} is not a website (database, cache, or queue).`,
      fix: "Nothing to host. Point aft at a web app (static, Vite, or Next.js).",
    };
  }
  if (s.runtime === "container" || s.framework === "django") {
    return {
      ok: false,
      error: "needs_container",
      action: "refuse",
      source: "rules",
      why: `${s.label || "This server"} needs a process runner. Local CLI upload is static/Next only.`,
      fix: "Paste the public GitHub repo on aft.page/run.",
    };
  }
  if (s.runtime === "next" && s.staticDeployable === false) {
    return {
      ok: false,
      error: "needs_next_build",
      action: "run_next",
      source: "rules",
      why: "Next.js app — aft will build and publish a live URL.",
      fix: "Run aft deploy (or paste the public GitHub repo on aft.page/run).",
    };
  }
  if (s.runtime && s.runtime !== "static" && s.staticDeployable === false) {
    return {
      ok: false,
      error: "not_static",
      action: "refuse",
      source: "rules",
      why: "This looks like a custom server app — set runtime + upstream in aft.json.",
      fix: "Ship the server URL into aft.json, then aft deploy the mapping site.",
    };
  }
  if (s.needsBuild && s.buildScript) {
    return {
      ok: false,
      error: "needs_build",
      action: "run_build",
      source: "rules",
      why: "This project is a bundler app with no dist/, out/, or build/ yet.",
      fix: `Run npm run ${s.buildScript}, then deploy that output folder.`,
    };
  }
  if (s.fileCount != null && s.fileCount > MAX_FILES) {
    return {
      ok: false,
      error: "too_many_files",
      action: "refuse",
      source: "rules",
      why: `Upload would have ${s.fileCount} files (cap ${MAX_FILES}).`,
      fix: "Deploy the built site, not the repo.",
    };
  }
  if (s.totalBytes != null && s.totalBytes > MAX_TOTAL_BYTES) {
    return {
      ok: false,
      error: "payload_too_large",
      action: "refuse",
      source: "rules",
      why: "Total upload is over 100 MB.",
      fix: "Ship a built static dist/ only — no node_modules, no .next.",
    };
  }
  if (s.hasIndexHtml === false) {
    const unknown = !s.hasPackageJson && (!s.framework || s.framework === "unknown");
    return {
      ok: false,
      error: unknown ? "unknown_project" : "no_index",
      action: "refuse",
      source: "rules",
      why: unknown
        ? "No package.json frontend and no index.html."
        : "The deploy root has no index.html, so the live URL would 404.",
      fix: "Ship a static site with index.html at the root (after build: dist/, out/, or build/).",
    };
  }
  return {
    ok: true,
    action: "none",
    source: "rules",
    why: "Artifact looks like a static site aft.page can host.",
    fix: "Deploy the built output.",
  };
}

async function walkStats(root) {
  const samplePaths = [];
  let fileCount = 0;
  let totalBytes = 0;

  async function walk(dir) {
    if (fileCount > MAX_WALK) return;
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of entries) {
      if (fileCount > MAX_WALK) return;
      const abs = join(dir, ent.name);
      const rel = relative(root, abs).split(sep).join("/");
      if (shouldSkip(rel)) continue;
      if (ent.isDirectory()) {
        await walk(abs);
        continue;
      }
      if (!ent.isFile()) continue;
      fileCount += 1;
      if (samplePaths.length < 40) samplePaths.push(rel);
      try {
        totalBytes += (await stat(abs)).size;
      } catch {
        /* skip */
      }
    }
  }

  await walk(root);
  return { fileCount, totalBytes, samplePaths };
}

async function readPkgMeta(projectRoot) {
  try {
    const pkg = JSON.parse(await readFile(join(projectRoot, "package.json"), "utf8"));
    const deps = Object.keys({
      ...(pkg.dependencies || {}),
      ...(pkg.devDependencies || {}),
    }).slice(0, 40);
    return {
      hasPackageJson: true,
      packageName: typeof pkg.name === "string" ? pkg.name : undefined,
      scripts: Object.keys(pkg.scripts || {}).slice(0, 20),
      deps,
    };
  } catch {
    return { hasPackageJson: false };
  }
}

async function configSnippets(projectRoot) {
  const names = [
    "next.config.js",
    "next.config.mjs",
    "next.config.ts",
    "aft.json",
  ];
  const out = [];
  for (const name of names) {
    if (out.length >= 3) break;
    try {
      const text = await readFile(join(projectRoot, name), "utf8");
      out.push({ name, text: text.slice(0, 2048) });
    } catch {
      /* none */
    }
  }
  return out;
}

export async function collectSnapshot(cwd, dirArg) {
  const target = await resolveDeployTarget(cwd, dirArg);
  const detected = target.detected || (await detectProject(target.projectRoot));
  const pkg = await readPkgMeta(target.projectRoot);
  const stats = target.needsBuild
    ? { fileCount: 0, totalBytes: 0, samplePaths: [] }
    : await walkStats(target.deployRoot);

  return {
    framework: detected.framework,
    label: detected.label,
    runtime: detected.runtime,
    staticDeployable: detected.staticDeployable,
    outDir: detected.outDir,
    buildScript: detected.buildScript,
    needsBuild: Boolean(target.needsBuild),
    deployRootIsRepoRoot: await isRepoRoot(target.deployRoot),
    hasIndexHtml: await hasIndexHtml(target.deployRoot),
    ...pkg,
    ...stats,
    configSnippets: await configSnippets(target.projectRoot),
    _target: target,
    _detected: detected,
  };
}

export async function fetchAdvice(snapshot) {
  if (process.env.AFT_PREFLIGHT === "0") return null;
  const { _target, _detected, ...body } = snapshot;
  try {
    const res = await apiFetch("/v1/cli/preflight", {
      method: "POST",
      json: { ...body, version: localVersion(), infer: true },
    });
    const data = await readJson(res);
    if (!res.ok || typeof data.ok !== "boolean") return null;
    return data;
  } catch {
    return null;
  }
}

/** Rules locally; API inference when blocked (refuse). Local refusal wins (it already knows the guard). */
export async function adviseDeploy(snapshot) {
  const local = adviseLocal(snapshot);
  if (local.ok || local.action === "run_build" || local.action === "run_next") return local;
  if (local.action === "refuse") return local;
  const remote = await fetchAdvice(snapshot);
  return remote || local;
}
