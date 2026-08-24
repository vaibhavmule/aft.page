/** aft env — secrets vault (requires aft login + claimed site). */
import { apiFetch, readJson } from "./api.js";
import { requireLogin, resolveProject } from "./project.js";
import { fail, note, ok, say, ui } from "./ui.js";

export async function cmdEnv(args) {
  await requireLogin();
  const [sub, ...rest] = args;
  const { slug } = await resolveProject();

  switch (sub) {
    case "list":
    case "ls":
    case undefined:
      return listEnv(slug);
    case "set":
      return setEnv(slug, rest);
    case "unset":
    case "rm":
    case "delete":
      return unsetEnv(slug, rest[0]);
    case "-h":
    case "--help":
    case "help":
      console.log(`Usage:
  aft env list
  aft env set NAME=value
  aft env set NAME value
  aft env unset NAME

Requires aft login and a claimed site.`);
      return;
    default:
      throw new Error(`Unknown aft env command: ${sub}\nRun: aft env --help`);
  }
}

async function listEnv(slug) {
  const res = await apiFetch(`/v1/sites/${encodeURIComponent(slug)}/secrets`);
  const body = await readJson(res);
  if (!res.ok) {
    authHint(res.status, body);
    throw new Error(body.hint || body.error || `env list failed (${res.status})`);
  }
  const names = body.secrets || [];
  if (names.length === 0) {
    note(`No secrets on ${slug}.aft.page`);
    note("Add one: aft env set NAME=value");
    return;
  }
  say(`${ui.ebold(slug)} secrets`);
  for (const name of names) console.log(`  ${name}`);
}

async function setEnv(slug, rest) {
  let name;
  let value;
  if (rest.length === 0) throw new Error("usage: aft env set NAME=value");
  if (rest.length === 1 && rest[0].includes("=")) {
    const i = rest[0].indexOf("=");
    name = rest[0].slice(0, i);
    value = rest[0].slice(i + 1);
  } else if (rest.length >= 2) {
    name = rest[0];
    value = rest.slice(1).join(" ");
  } else {
    throw new Error("usage: aft env set NAME=value");
  }
  name = String(name || "").trim();
  await putEnvSecret(slug, name, value);
}

/** PUT one secret; used by aft env set and aft migrate vercel. */
export async function putEnvSecret(slug, name, value, { quiet = false } = {}) {
  if (!/^[A-Za-z0-9_.-]+$/.test(name)) {
    throw new Error("secret name must match [A-Za-z0-9_.-]+");
  }
  if (!value) throw new Error("value required");

  const res = await apiFetch(
    `/v1/sites/${encodeURIComponent(slug)}/secrets/${encodeURIComponent(name)}`,
    { method: "PUT", json: { value } },
  );
  const body = await readJson(res);
  if (!res.ok) {
    authHint(res.status, body);
    throw new Error(body.hint || body.error || `env set failed (${res.status})`);
  }
  if (!quiet) {
    if (body.synced) ok(`Set ${name} on ${slug}.aft.page (synced to Worker)`);
    else if (body.syncReason === "worker_not_ready") {
      ok(`Set ${name} on ${slug}.aft.page`);
      note("Worker not live yet — secret stays in vault until next/worker upstream exists.");
    } else {
      ok(`Set ${name} on ${slug}.aft.page`);
      note(body.syncReason || "Vault saved; Worker sync pending.");
    }
  }
  return { synced: Boolean(body.synced), syncReason: body.syncReason };
}

async function unsetEnv(slug, name) {
  name = String(name || "").trim();
  if (!name) throw new Error("usage: aft env unset NAME");
  const res = await apiFetch(
    `/v1/sites/${encodeURIComponent(slug)}/secrets/${encodeURIComponent(name)}`,
    { method: "DELETE" },
  );
  const body = await readJson(res);
  if (!res.ok) {
    authHint(res.status, body);
    throw new Error(body.hint || body.error || `env unset failed (${res.status})`);
  }
  ok(`Removed ${name}`);
}

function authHint(status, body) {
  if (status === 401 || status === 403) {
    fail("Secrets need a claimed site you own.");
    note("Claim on the live URL, then: aft login");
  } else if (body?.error) {
    fail(body.error);
  }
}
