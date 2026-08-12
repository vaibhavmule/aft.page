/** Pick deploy root (dist/out/build) and project root for state + aft.json. */
import { access, readFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { detectProject } from "./detect.js";
import { sanitizeSlug } from "./slug.js";

export const OUTPUT_DIRS = ["dist", "out", "build"];

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
    const deployRoot = join(cwd, explicitDir);
    const projectRoot = (await findProjectRoot(deployRoot)) || deployRoot;
    return { deployRoot, projectRoot };
  }

  if (await hasIndexHtml(cwd)) {
    const projectRoot = (await findProjectRoot(cwd)) || cwd;
    return { deployRoot: cwd, projectRoot };
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
    if (await hasIndexHtml(preferred)) {
      return { deployRoot: preferred, projectRoot: cwd, detected };
    }
    if (
      (await exists(join(cwd, "src"))) ||
      (await exists(join(cwd, "app"))) ||
      detected.buildScript
    ) {
      return {
        deployRoot: cwd,
        projectRoot: cwd,
        needsBuild: true,
        detected,
      };
    }
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
