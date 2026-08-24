/** Walk a directory and deploy to api.aft.page. */
import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { apiFetch, readJson } from "./api.js";
import { ensureAftJson } from "./init.js";
import { confirm, isInteractive } from "./prompt.js";
import {
  attachProjectManifest,
  readSlugHint,
  shouldSkip,
} from "./resolve.js";
import { adviseDeploy, collectSnapshot } from "./preflight.js";
import { loadState, readAftJsonSlug, saveState } from "./state.js";
import { deployNextSsr } from "./next-deploy.js";
import { isVerbose, note, ok, runCmd, runStep, say, stripVerboseFlags } from "./ui.js";

export { shouldSkip };

const MAX_FILES = 500;
const MAX_FILE_BYTES = 25 * 1024 * 1024;

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
      if (st.size > MAX_FILE_BYTES) {
        throw new Error(`file too large (>25MB): ${rel}`);
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

async function runBuild(projectRoot, script, { verbose = false } = {}) {
  await runStep(`Running npm run ${script}…`, async () => {
    runCmd("npm", ["run", script], projectRoot, { verbose });
  }, { verbose });
}

function throwAdvice(advice) {
  throw new Error(`${advice.why}\n  fix: ${advice.fix}`);
}

export async function ensureDeployable(
  cwd,
  dirArg,
  { checkOnly = false, verbose = false } = {},
) {
  let snapshot = await collectSnapshot(cwd, dirArg);
  let advice = await adviseDeploy(snapshot);

  if (checkOnly) return { snapshot, advice };

  if (advice.ok) return snapshot._target;

  if (advice.action === "run_next") {
    return { ...snapshot._target, kind: "next" };
  }

  if (advice.action === "run_build") {
    const script = snapshot.buildScript || "build";
    if (isInteractive()) {
      const okBuild = await confirm(
        `No build output yet. Run npm run ${script}?`,
        { defaultYes: true },
      );
      if (!okBuild) throwAdvice(advice);
    }
    await runBuild(snapshot._target.projectRoot, script, { verbose });
    snapshot = await collectSnapshot(cwd, dirArg);
    advice = await adviseDeploy(snapshot);
    if (advice.ok) return snapshot._target;
  }

  throwAdvice(advice);
}

export async function cmdDeploy(args) {
  const verbose = isVerbose(args);
  const filtered = stripVerboseFlags(args);
  const dirArg = positionalDir(filtered);
  const slugFlag = flagValue(filtered, "--slug");
  const checkOnly = filtered.includes("--check");

  if (checkOnly) {
    const { advice } = await ensureDeployable(process.cwd(), dirArg, {
      checkOnly: true,
    });
    console.log(JSON.stringify(advice, null, 2));
    if (!advice.ok) process.exitCode = 2;
    return;
  }

  const target = await ensureDeployable(process.cwd(), dirArg, { verbose });

  if (target.kind === "next") {
    const initSlug = await ensureAftJson(target.projectRoot);
    if (initSlug) note(`Wrote aft.json → ${initSlug}`);
    const state = await loadState(target.projectRoot);
    const slug =
      slugFlag ||
      state?.slug ||
      (await readAftJsonSlug(target.projectRoot)) ||
      (await readSlugHint(target.projectRoot));
    if (!slug) throw new Error("No slug. Pass --slug or add name to package.json.");
    const body = await deployNextSsr(target.projectRoot, slug, {
      editToken: state?.editToken,
      verbose,
    });
    if (body.editToken) {
      await saveState(target.projectRoot, { slug: body.slug, editToken: body.editToken });
    } else if (body.slug && state?.editToken) {
      await saveState(target.projectRoot, { slug: body.slug, editToken: state.editToken });
    }
    ok(body.url);
    console.log(body.url);
    if (body.claimUrl) note(`Claim: ${body.claimUrl}`);
    if (body.notice) note(body.notice);
    return;
  }

  const { deployRoot, projectRoot } = target;

  if (deployRoot !== projectRoot) {
    say(`Using ${deployRoot.replace(projectRoot + "/", "")}/`);
  }

  const initSlug = await ensureAftJson(projectRoot);
  if (initSlug) note(`Wrote aft.json → ${initSlug}`);

  let files = await collectFiles(deployRoot);
  files = await attachProjectManifest(files, projectRoot, deployRoot);
  if (files.length === 0) throw new Error("no files to deploy");
  if (files.length > MAX_FILES) throw new Error(`too many files (${files.length}; max ${MAX_FILES})`);

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
