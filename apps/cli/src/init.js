/** Write aft.json from package.json (or folder name) + framework detect. */
import { access, readFile, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import {
  FRAMEWORK_CHOICES,
  detectProject,
  projectFromChoice,
} from "./detect.js";
import { confirm, isInteractive, select } from "./prompt.js";
import { sanitizeSlug } from "./slug.js";
import { note, ok, say } from "./ui.js";

async function deriveName(projectRoot) {
  let name = basename(projectRoot);
  try {
    const pkg = JSON.parse(await readFile(join(projectRoot, "package.json"), "utf8"));
    name = String(pkg.name || name)
      .split("/")
      .pop();
  } catch {
    /* plain folder */
  }
  return name;
}

/** Pick framework: auto-detect, confirm or menu when TTY. */
export async function chooseFramework(projectRoot, { interactive = isInteractive() } = {}) {
  const detected = await detectProject(projectRoot);
  if (!interactive) return detected;

  say(`Detected: ${detected.label}`);
  if (detected.note) note(detected.note);

  const useDetected = await confirm("Use this?", { defaultYes: true });
  if (useDetected) return detected;

  const picked = await select("Framework / runtime", FRAMEWORK_CHOICES, {
    label: (c) => c.label,
    defaultIndex: Math.max(
      0,
      FRAMEWORK_CHOICES.findIndex((c) => c.id === detected.framework),
    ),
  });
  return projectFromChoice(picked.id, detected);
}

/** Create aft.json when missing. Returns new slug, or null if already present. */
export async function ensureAftJson(
  projectRoot,
  { errorIfExists = false, interactive = isInteractive() } = {},
) {
  const aftPath = join(projectRoot, "aft.json");
  try {
    await access(aftPath);
    if (errorIfExists) throw new Error("aft.json already exists");
    return null;
  } catch (err) {
    if (err?.code !== "ENOENT") throw err;
  }

  const name = await deriveName(projectRoot);
  const slug = sanitizeSlug(name);
  if (!slug) throw new Error(`could not derive slug from "${name}"`);

  const framework = await chooseFramework(projectRoot, { interactive });
  const manifest = {
    name: slug,
    slug,
    runtime: framework.runtime || "static",
  };
  if (framework.note && !framework.staticDeployable) {
    note(framework.note);
  }

  await writeFile(aftPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return slug;
}

export async function cmdInit() {
  const slug = await ensureAftJson(process.cwd(), { errorIfExists: true });
  ok(`Wrote aft.json → ${slug}`);
  note("Next: aft deploy");
}
