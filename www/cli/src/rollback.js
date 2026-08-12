/** aft rollback — requires aft login (claimed site / editor). */
import { apiFetch, readJson } from "./api.js";
import { requireLogin, resolveProject } from "./project.js";
import { note, ok, say, ui } from "./ui.js";

export async function cmdRollback(args) {
  await requireLogin();
  const { slug } = await resolveProject();
  const deployId = args.find((a) => !a.startsWith("-"));

  if (!deployId || deployId === "list" || deployId === "ls") {
    return listDeploys(slug);
  }

  say(`Rolling back ${slug} → ${deployId}…`);
  const res = await apiFetch(
    `/v1/sites/${encodeURIComponent(slug)}/rollback`,
    {
      method: "POST",
      json: { deployId },
    },
  );
  const body = await readJson(res);
  if (!res.ok) {
    throw new Error(
      body.hint || body.error || `rollback failed (${res.status})`,
    );
  }
  ok(body.url || `https://${slug}.aft.page`);
  console.log(body.url || `https://${slug}.aft.page`);
}

async function listDeploys(slug) {
  const res = await apiFetch(`/v1/sites/${encodeURIComponent(slug)}/deploys`);
  const body = await readJson(res);
  if (!res.ok) {
    throw new Error(body.hint || body.error || `deploys failed (${res.status})`);
  }
  const current = body.currentDeployId;
  const deploys = body.deploys || [];
  if (deploys.length === 0) {
    note("No deploys recorded.");
    return;
  }
  say(`${ui.ebold(slug)} deploys`);
  for (const d of deploys) {
    const mark = d.id === current ? ui.egreen("●") : ui.edim("○");
    const when = d.createdAt ? d.createdAt.replace("T", " ").slice(0, 19) : "";
    console.log(`  ${mark} ${d.id}  ${ui.dim(when)}`);
  }
  note("Rollback: aft rollback <deployId>");
}
