/** aft rename — requires aft login + claimed site. */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { apiFetch, readJson } from "./api.js";
import { requireLogin, resolveProject } from "./project.js";
import { sanitizeSlug } from "./slug.js";
import { fail, note, ok, say } from "./ui.js";

export async function cmdRename(args) {
  await requireLogin();
  const next = sanitizeSlug(args[0] || "");
  if (!next) throw new Error("usage: aft rename <new-slug>");

  const { cwd, slug: fromSlug, state } = await resolveProject();
  if (next === fromSlug) {
    ok(`Already ${fromSlug}.aft.page`);
    return;
  }

  say(`Renaming ${fromSlug} → ${next}…`);
  const res = await apiFetch(
    `/v1/sites/${encodeURIComponent(fromSlug)}/rename`,
    { method: "POST", json: { slug: next } },
  );
  const body = await readJson(res);
  if (!res.ok || !body.slug) {
    if (res.status === 401 || res.status === 403) {
      fail("Rename needs a claimed site you own.");
      note("Claim on the live URL (or preview), then: aft login && aft rename <slug>");
      process.exitCode = 1;
      return;
    }
    throw new Error(
      body.hint || body.message || body.error || `rename failed (${res.status})`,
    );
  }

  if (state?.editToken) {
    const { saveState } = await import("./state.js");
    await saveState(cwd, { slug: body.slug, editToken: state.editToken });
  }

  try {
    const aftPath = join(cwd, "aft.json");
    const json = JSON.parse(await readFile(aftPath, "utf8"));
    json.slug = body.slug;
    if (typeof json.name === "string") json.name = body.slug;
    await writeFile(aftPath, `${JSON.stringify(json, null, 2)}\n`);
  } catch {
    /* optional */
  }

  ok(body.url || `https://${body.slug}.aft.page`);
  console.log(body.url || `https://${body.slug}.aft.page`);
}
