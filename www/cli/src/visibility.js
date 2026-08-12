/** aft visibility — public | private (requires login + claimed). */
import { apiFetch, readJson } from "./api.js";
import { requireLogin, resolveProject } from "./project.js";
import { fail, note, ok } from "./ui.js";

export async function cmdVisibility(args) {
  await requireLogin();
  const { slug } = await resolveProject();
  const next = String(args[0] || "")
    .toLowerCase()
    .trim();

  if (next !== "public" && next !== "private") {
    throw new Error("usage: aft visibility public|private");
  }

  const res = await apiFetch(`/v1/sites/${encodeURIComponent(slug)}`, {
    method: "PATCH",
    json: { visibility: next },
  });
  const body = await readJson(res);
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      fail("Visibility needs a claimed site you own.");
      note("Claim on the live URL, then: aft login");
      process.exitCode = 1;
      return;
    }
    throw new Error(body.hint || body.error || `failed (${res.status})`);
  }
  ok(`${slug}.aft.page is ${next}`);
}
