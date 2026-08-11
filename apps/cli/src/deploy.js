/** Walk a directory and deploy to api.aft.page. */
import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { apiFetch, readJson } from "./api.js";
import { loadState, readAftJsonSlug, saveState } from "./state.js";

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

export async function cmdDeploy(args) {
  const dir = args[0] || ".";
  const root = join(process.cwd(), dir);
  const slugFlag = flagValue(args, "--slug");

  const files = await collectFiles(root);
  if (files.length === 0) throw new Error("no files to deploy");
  if (files.length > 200) throw new Error(`too many files (${files.length}; max 200)`);

  const state = await loadState(root);
  const slug =
    slugFlag || state?.slug || (await readAftJsonSlug(root)) || undefined;
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

  console.error(`Deploying ${files.length} file(s)${slug ? ` → ${slug}` : ""}…`);
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
    await saveState(root, { slug: body.slug, editToken: body.editToken });
  } else if (body.slug && state?.editToken) {
    await saveState(root, { slug: body.slug, editToken: state.editToken });
  }

  console.log(body.url);
  if (body.claimUrl) console.error(`Claim: ${body.claimUrl}`);
  if (body.notice) console.error(body.notice);
}

function flagValue(args, name) {
  const i = args.indexOf(name);
  if (i === -1) return undefined;
  return args[i + 1];
}
