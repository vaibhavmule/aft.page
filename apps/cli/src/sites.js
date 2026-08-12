/** aft sites — list claimed projects (requires login). */
import { apiFetch, readJson } from "./api.js";
import { requireLogin } from "./project.js";
import { note, ui } from "./ui.js";

export async function cmdSites() {
  await requireLogin();
  const res = await apiFetch("/v1/me/sites?limit=100");
  const body = await readJson(res);
  if (!res.ok) {
    throw new Error(body.error || `sites failed (${res.status})`);
  }

  const owned = body.sites || [];
  const shared = body.shared || [];
  if (owned.length === 0 && shared.length === 0) {
    note("No projects yet. Deploy something, claim it, then check back.");
    return;
  }

  if (owned.length) {
    console.error(ui.ebold("Yours"));
    for (const s of owned) {
      const url = s.url || `https://${s.slug}.aft.page`;
      const vis = s.visibility === "private" ? ui.edim(" private") : "";
      console.log(`  ${s.slug.padEnd(28)} ${url}${vis}`);
    }
  }
  if (shared.length) {
    if (owned.length) console.log("");
    console.error(ui.ebold("Shared with you"));
    for (const s of shared) {
      const url = s.url || `https://${s.slug}.aft.page`;
      console.log(`  ${s.slug.padEnd(28)} ${url}`);
    }
  }
}
