/** Read/write .aft/state.json (hosted slug + editToken). */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

export async function loadState(dir) {
  try {
    const raw = await readFile(join(dir, ".aft", "state.json"), "utf8");
    const data = JSON.parse(raw);
    if (
      data &&
      typeof data.slug === "string" &&
      data.slug &&
      typeof data.editToken === "string" &&
      data.editToken
    ) {
      return { slug: data.slug, editToken: data.editToken };
    }
  } catch {
    /* missing or incompatible */
  }
  return null;
}

export async function saveState(dir, state) {
  const folder = join(dir, ".aft");
  await mkdir(folder, { recursive: true });
  await writeFile(
    join(folder, "state.json"),
    JSON.stringify(
      { slug: state.slug, editToken: state.editToken },
      null,
      2,
    ) + "\n",
    { mode: 0o600 },
  );
}

export async function readAftJsonSlug(dir) {
  try {
    const raw = await readFile(join(dir, "aft.json"), "utf8");
    const json = JSON.parse(raw);
    for (const field of [json.slug, json.name]) {
      const slug = String(field || "")
        .toLowerCase()
        .trim();
      if (/^[a-z0-9](?:[a-z0-9-]{0,46}[a-z0-9])?$/.test(slug)) return slug;
    }
  } catch {
    /* none */
  }
  return null;
}
