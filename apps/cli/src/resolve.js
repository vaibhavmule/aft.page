/** Pick deploy root (dist/out/build) and project root for state + aft.json. */
import { access, readFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join } from "node:path";
import { detectProject } from "./detect.js";
import { sanitizeSlug } from "./slug.js";

export const OUTPUT_DIRS = ["dist", "out", "build"];

const SKIP_DIR_NAMES = new Set(["node_modules", ".git", ".aft", ".npm"]);
const SKIP_FILE_PREFIX = [".env"];
const SKIP_FILES = new Set([".DS_Store"]);

export function shouldSkip(relPath) {
  const parts = relPath.split(/[/\\]/).filter(Boolean);
  for (const p of parts) {
    if (SKIP_DIR_NAMES.has(p)) return true;
    if (SKIP_FILES.has(p)) return true;
    if (SKIP_FILE_PREFIX.some((pre) => p === pre || p.startsWith(`${pre}.`))) {
      return true;
    }
  }
  return false;
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export async function hasIndexHtml(dir) {
  return (await exists(join(dir, "index.html"))) || (await exists(join(dir, "index.htm")));
}

/** True when the deploy root is the root of a git checkout (has .git). */
export async function isRepoRoot(dir) {
  return await exists(join(dir, ".git"));
}

/** Walk up from dir to find package.json (for `cd dist && aft deploy`). */
export async function findProjectRoot(dir) {
  let cur = dir;
  while (true) {
    if (await exists(join(cur, "package.json"))) return cur;
    const parent = dirname(cur);
    if (parent === cur) return null;
    cur = parent;
  }
}

/**
 * @returns {Promise<{ deployRoot: string, projectRoot: string, needsBuild?: boolean, detected?: object }>}
 */
export async function resolveDeployTarget(cwd, explicitDir) {
  if (explicitDir && explicitDir !== ".") {
    const base = isAbsolute(explicitDir) ? explicitDir : join(cwd, explicitDir);
    if (await exists(join(base, "package.json"))) {
      const detected = await detectProject(base);
      for (const out of OUTPUT_DIRS) {
        const candidate = join(base, out);
        if (await hasIndexHtml(candidate)) {
          return { deployRoot: candidate, projectRoot: base, detected };
        }
      }
      const preferred = join(base, detected.outDir || "dist");
      if (detected.outDir && detected.outDir !== "." && (await hasIndexHtml(preferred))) {
        return { deployRoot: preferred, projectRoot: base, detected };
      }
      if (detected.staticDeployable && detected.outDir && detected.outDir !== ".") {
        return { deployRoot: base, projectRoot: base, needsBuild: true, detected };
      }
      if (!detected.staticDeployable && detected.runtime && detected.runtime !== "static") {
        return { deployRoot: base, projectRoot: base, detected };
      }
      if (await hasIndexHtml(base)) {
        return { deployRoot: base, projectRoot: base, detected };
      }
      return { deployRoot: base, projectRoot: base, detected };
    }

    if (await hasIndexHtml(base)) {
      const projectRoot = (await findProjectRoot(base)) || base;
      return { deployRoot: base, projectRoot };
    }

    return { deployRoot: base, projectRoot: base };
  }

  if (await exists(join(cwd, "package.json"))) {
    const detected = await detectProject(cwd);
    for (const out of OUTPUT_DIRS) {
      const candidate = join(cwd, out);
      if (await hasIndexHtml(candidate)) {
        return { deployRoot: candidate, projectRoot: cwd, detected };
      }
    }
    const preferred = join(cwd, detected.outDir || "dist");
    if (detected.outDir && detected.outDir !== "." && (await hasIndexHtml(preferred))) {
      return { deployRoot: preferred, projectRoot: cwd, detected };
    }
    // Vite/CRA source index.html lives at repo root — that is not the deploy root.
    if (detected.staticDeployable && detected.outDir && detected.outDir !== ".") {
      return {
        deployRoot: cwd,
        projectRoot: cwd,
        needsBuild: true,
        detected,
      };
    }
    if (!detected.staticDeployable && detected.runtime && detected.runtime !== "static") {
      return { deployRoot: cwd, projectRoot: cwd, detected };
    }
    if (await hasIndexHtml(cwd)) {
      return { deployRoot: cwd, projectRoot: cwd, detected };
    }
    return { deployRoot: cwd, projectRoot: cwd, detected };
  }

  if (await hasIndexHtml(cwd)) {
    const projectRoot = (await findProjectRoot(cwd)) || cwd;
    return { deployRoot: cwd, projectRoot };
  }

  return { deployRoot: cwd, projectRoot: cwd };
}

export async function readSlugHint(projectRoot) {
  try {
    const raw = await readFile(join(projectRoot, "aft.json"), "utf8");
    const json = JSON.parse(raw);
    const slug = sanitizeSlug(json.slug || json.name);
    if (slug) return slug;
  } catch {
    /* none */
  }
  try {
    const raw = await readFile(join(projectRoot, "package.json"), "utf8");
    const name = String(JSON.parse(raw).name || "")
      .split("/")
      .pop();
    const slug = sanitizeSlug(name);
    if (slug) return slug;
  } catch {
    /* none */
  }
  return sanitizeSlug(basename(projectRoot));
}

/** Attach project aft.json when deploying a build output folder. */
export async function attachProjectManifest(files, projectRoot, deployRoot) {
  if (projectRoot === deployRoot) return files;
  if (files.some((f) => f.path === "aft.json")) return files;
  try {
    const content = await readFile(join(projectRoot, "aft.json"), "utf8");
    return [...files, { path: "aft.json", content, encoding: "utf8" }];
  } catch {
    return files;
  }
}
