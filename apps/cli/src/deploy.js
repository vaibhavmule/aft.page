/** Walk a directory and deploy to api.aft.page. */
import { spawnSync } from "node:child_process";
import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { apiFetch, readJson } from "./api.js";
import { ensureAftJson } from "./init.js";
import { confirm, isInteractive } from "./prompt.js";
import {
  attachProjectManifest,
  hasIndexHtml,
  readSlugHint,
  resolveDeployTarget,
} from "./resolve.js";
import { loadState, readAftJsonSlug, saveState } from "./state.js";
import { note, ok, say } from "./ui.js";

const SKIP_DIR_NAMES = new Set(["node_modules", ".git", ".aft"]);
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

export async function collectFiles(root) {
  const out = [];

  async function walk(dir) {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const ent of entries) {
      const abs = join(dir, ent.name);
      const rel = relative(root, abs).split(sep).join("/");
      if (shouldSkip(rel)) continue;
      if (ent.isDirectory()) {
        await walk(abs);
        continue;
      }
      if (!ent.isFile()) continue;
      const st = await stat(abs);
      if (st.size > 10 * 1024 * 1024) {
        throw new Error(`file too large (>10MB): ${rel}`);
      }
      const buf = await readFile(abs);
      const text = buf.toString("utf8");
      const isBinary = text.includes("\u0000");
      out.push(
        isBinary
          ? {
              path: rel,
              content: buf.toString("base64"),
              encoding: "base64",
            }
          : { path: rel, content: text, encoding: "utf8" },
      );
    }
  }

  await walk(root);
  return out;
}

function runBuild(projectRoot, script) {
  say(`Running npm run ${script}…`);
  const r = spawnSync("npm", ["run", script], {
    cwd: projectRoot,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (r.status !== 0) {
    throw new Error(`npm run ${script} failed (exit ${r.status ?? "?"})`);
  }
}

async function ensureDeployable(cwd, dirArg) {
  let target = await resolveDeployTarget(cwd, dirArg);

  if (!target.needsBuild) return target;

  const detected = target.detected;
  const script = detected?.buildScript || "build";

  if (!detected?.staticDeployable && detected?.runtime && detected.runtime !== "static") {
    throw new Error(
      `${detected.label} needs runtime "${detected.runtime}" + upstream in aft.json — not a static folder deploy. See https://aft.page/docs`,
    );
  }

  if (isInteractive()) {
    const okBuild = await confirm(
      `No build output yet. Run npm run ${script}?`,
      { defaultYes: true },
    );
    if (!okBuild) {
      throw new Error(
        `no build output (dist/, out/, or build/ with index.html). Run: npm run ${script}`,
      );
    }
    runBuild(target.projectRoot, script);
  } else {
    throw new Error(
      `no build output (dist/, out/, or build/ with index.html). Run: npm run ${script}`,
    );
  }

  target = await resolveDeployTarget(cwd, dirArg);
  if (target.needsBuild || !(await hasIndexHtml(target.deployRoot))) {
    throw new Error(
      `still no index.html after build — expected ${detected?.outDir || "dist/"}/`,
    );
  }
  return target;
}

export async function cmdDeploy(args) {
  const dirArg = positionalDir(args);
  const slugFlag = flagValue(args, "--slug");
  const { deployRoot, projectRoot } = await ensureDeployable(
    process.cwd(),
    dirArg,
  );

  if (deployRoot !== projectRoot) {
    say(`Using ${deployRoot.replace(projectRoot + "/", "")}/`);
  }

  const initSlug = await ensureAftJson(projectRoot);
  if (initSlug) note(`Wrote aft.json → ${initSlug}`);

  let files = await collectFiles(deployRoot);
  files = await attachProjectManifest(files, projectRoot, deployRoot);
  if (files.length === 0) throw new Error("no files to deploy");
  if (files.length > 200) throw new Error(`too many files (${files.length}; max 200)`);

  const state = await loadState(projectRoot);
  const slug =
    slugFlag ||
    state?.slug ||
    (await readAftJsonSlug(projectRoot)) ||
    (await readSlugHint(projectRoot)) ||
    undefined;
  const editToken = state?.editToken;

  const method = editToken ? "PATCH" : "POST";
  if (editToken && !slug) {
    throw new Error(".aft/state.json has editToken but no slug");
  }

  const path = slug
    ? `/v1/deploy?slug=${encodeURIComponent(slug)}`
    : "/v1/deploy";
  const headers = {};
  if (editToken) headers["x-aft-edit-token"] = editToken;

  say(`Deploying ${files.length} file(s)${slug ? ` → ${slug}` : ""}…`);
  const res = await apiFetch(path, {
    method,
    headers,
    json: { files },
  });
  const body = await readJson(res);
  if (!res.ok || !body.url) {
    throw new Error(
      body.hint || body.message || body.error || `deploy failed (${res.status})`,
    );
  }

  if (body.editToken) {
    await saveState(projectRoot, {
      slug: body.slug,
      editToken: body.editToken,
    });
  } else if (body.slug && state?.editToken) {
    await saveState(projectRoot, {
      slug: body.slug,
      editToken: state.editToken,
    });
  }

  ok(body.url);
  console.log(body.url);
  if (body.claimUrl) note(`Claim: ${body.claimUrl}`);
  if (body.notice) note(body.notice);
}

function flagValue(args, name) {
  const i = args.indexOf(name);
  if (i === -1) return undefined;
  return args[i + 1];
}

function positionalDir(args) {
  return args.find((a) => !a.startsWith("-")) || ".";
}
