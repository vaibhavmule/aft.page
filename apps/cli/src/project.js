/** Shared project + auth helpers. */
import { loadCredentials } from "./creds.js";
import { loadState, readAftJsonSlug } from "./state.js";
import { note } from "./ui.js";

export async function requireLogin() {
  if (process.env.AFT_TOKEN) return { token: process.env.AFT_TOKEN };
  const creds = await loadCredentials();
  if (!creds?.token) {
    throw new Error("Not logged in. Run: aft login");
  }
  return creds;
}

/** Slug + optional editToken from cwd (.aft/state.json or aft.json). */
export async function resolveProject(cwd = process.cwd()) {
  const state = await loadState(cwd);
  const slug = state?.slug || (await readAftJsonSlug(cwd));
  if (!slug) {
    throw new Error(
      "No project slug here. Run aft deploy first (writes aft.json), or set slug in aft.json.",
    );
  }
  return { cwd, slug, state };
}

export function editHeaders(state) {
  const headers = {};
  if (state?.editToken) headers["x-aft-edit-token"] = state.editToken;
  return headers;
}

export function hintClaim(slug) {
  note(`Claim to keep it: https://aft.page/claim?slug=${encodeURIComponent(slug)}`);
}
