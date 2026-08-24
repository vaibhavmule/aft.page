/** aft domain(s) — custom domains. List is account-wide by default. */
import { apiFetch, readJson } from "./api.js";
import { requireLogin, resolveProject } from "./project.js";
import { note, ok, say, ui } from "./ui.js";

export async function cmdDomains(args = []) {
  const flags = args.filter((a) => String(a).startsWith("--"));
  const positional = args.filter((a) => !String(a).startsWith("--"));
  let [sub, ...rest] = positional;

  if (sub === "-h" || sub === "--help" || sub === "help" || flags.includes("--help")) {
    console.log(`Usage:
  aft domains [--pending|--active|--error|--here]
  aft domain add app.example.com
  aft domain refresh app.example.com
  aft domain remove app.example.com
  aft domain request-access

List shows every domain on your account (pending + active). Filter with flags.
Add/remove/refresh use this project (aft.json / .aft/state.json).

Requires aft login.`);
    return;
  }

  // Shortcut: `aft domain app.example.com` → `aft domain add app.example.com`
  const known = new Set([
    "list",
    "ls",
    "add",
    "refresh",
    "remove",
    "rm",
    "delete",
    "request-access",
  ]);
  if (
    typeof sub === "string" &&
    !known.has(sub) &&
    rest.length === 0 &&
    sub.includes(".")
  ) {
    const hostname = sub;
    sub = "add";
    rest = [hostname];
  }

  await requireLogin();

  switch (sub) {
    case undefined:
    case "list":
    case "ls":
      return listAllDomains(flags);
    case "add":
    case "refresh":
    case "remove":
    case "rm":
    case "delete":
    case "request-access": {
      const { slug } = await resolveProject();
      if (sub === "add") return addDomain(slug, rest[0]);
      if (sub === "refresh") return refreshDomain(slug, rest[0]);
      if (sub === "request-access") return requestAccess(slug);
      return removeDomain(slug, rest[0]);
    }
    default:
      throw new Error(`Unknown aft domain command: ${sub}\nRun: aft domain --help`);
  }
}

function listFlags(args) {
  const pending = args.includes("--pending");
  const active = args.includes("--active");
  const error = args.includes("--error");
  const here = args.includes("--here");
  let status;
  if (pending) status = "pending";
  else if (active) status = "active";
  else if (error) status = "error";
  return { status, here };
}

async function listAllDomains(args) {
  const { status, here } = listFlags(args);
  const q = new URLSearchParams();
  if (status) q.set("status", status);

  let hereSlug = null;
  if (here) {
    try {
      hereSlug = (await resolveProject()).slug;
      q.set("slug", hereSlug);
    } catch {
      throw new Error("No project here. Run from a deployed folder, or drop --here.");
    }
  }

  const path = `/v1/me/domains${q.toString() ? `?${q}` : ""}`;
  const res = await apiFetch(path);
  const body = await readJson(res);
  if (!res.ok) {
    hintDomainAuth(res.status, body);
    throw new Error(body.hint || body.error || `domains failed (${res.status})`);
  }

  const domains = body.domains || [];
  const cname = body.cname || "cname.aft.page";
  const access = body.access || "none";

  if (domains.length === 0) {
    if (hereSlug) note(`No custom domains on ${hereSlug}.aft.page`);
    else note("No custom domains yet.");
    if (access !== "approved") {
      note("Request access: aft domain request-access");
    } else {
      note("Add one: aft domain add app.example.com");
    }
    return;
  }

  const title = hereSlug
    ? `${ui.ebold(hereSlug)} domains`
    : ui.ebold(`Domains (${domains.length})`);
  say(title);

  for (const d of domains) {
    const phase = domainPhase(d);
    const detail = phaseDetail(d);
    const project = hereSlug ? "" : `  ${ui.edim(d.slug)}`;
    console.log(`  ${d.hostname}  ${phase}${detail ? ` ${ui.edim(detail)}` : ""}${project}`);
    if (needsDns(d)) {
      if (d.txtName && d.txtValue) {
        console.log(`    TXT   ${d.txtName} = ${d.txtValue}`);
      }
      console.log(`    CNAME ${d.hostname} -> ${d.cname || cname}`);
    }
  }
}

async function addDomain(slug, hostname) {
  hostname = String(hostname || "").trim();
  if (!hostname) throw new Error("usage: aft domain add app.example.com");

  const res = await apiFetch(`/v1/sites/${encodeURIComponent(slug)}/domains`, {
    method: "POST",
    json: { hostname },
  });
  const body = await readJson(res);
  if (!res.ok || !body.domain) {
    if (body.error === "domain_gated") {
      note("Custom domains are not enabled on this account yet.");
      note("Request access: aft domain request-access");
      return;
    }
    hintDomainAuth(res.status, body);
    throw new Error(body.hint || body.error || `domain add failed (${res.status})`);
  }
  printDomainAdded(body.domain);
}

async function refreshDomain(slug, hostname) {
  hostname = String(hostname || "").trim();
  if (!hostname) throw new Error("usage: aft domain refresh app.example.com");

  const res = await apiFetch(
    `/v1/sites/${encodeURIComponent(slug)}/domains/${encodeURIComponent(hostname)}`,
    { method: "POST" },
  );
  const body = await readJson(res);
  if (!res.ok || !body.domain) {
    hintDomainAuth(res.status, body);
    throw new Error(body.hint || body.error || `domain refresh failed (${res.status})`);
  }
  printDomainAdded(body.domain);
}

async function removeDomain(slug, hostname) {
  hostname = String(hostname || "").trim();
  if (!hostname) throw new Error("usage: aft domain remove app.example.com");

  const res = await apiFetch(
    `/v1/sites/${encodeURIComponent(slug)}/domains/${encodeURIComponent(hostname)}`,
    { method: "DELETE" },
  );
  const body = await readJson(res);
  if (!res.ok) {
    hintDomainAuth(res.status, body);
    throw new Error(body.hint || body.error || `domain remove failed (${res.status})`);
  }
  ok(`Removed ${hostname}`);
}

async function requestAccess(slug) {
  const res = await apiFetch(
    `/v1/sites/${encodeURIComponent(slug)}/domains/access`,
    { method: "POST" },
  );
  const body = await readJson(res);
  if (!res.ok) {
    hintDomainAuth(res.status, body);
    throw new Error(body.hint || body.error || `domain access failed (${res.status})`);
  }
  if (body.access === "approved") {
    ok("Custom domains are already enabled.");
    note("Add one: aft domain add app.example.com");
    return;
  }
  ok("Custom domain access requested.");
}

function printDomainAdded(domain) {
  const phase = domainPhase(domain);
  ok(`${domain.hostname} (${phase})`);
  if (domain.status === "active") return;
  if (needsDns(domain)) {
    if (domain.txtName && domain.txtValue) {
      console.log(`TXT   ${domain.txtName} = ${domain.txtValue}`);
    }
    console.log(`CNAME ${domain.hostname} -> ${domain.cname}`);
    note(`After DNS is live, run: aft domain refresh ${domain.hostname}`);
    return;
  }
  note(`Still going. Check again: aft domain refresh ${domain.hostname}`);
}

/** Human status — matches dashboard domainMeta; no raw SSL enums. */
export function domainPhase(d) {
  if (d.status === "active") return "active";
  if (d.status === "error") return "error";
  const ssl = String(d.sslStatus || "").toLowerCase();
  if (ssl === "pending_validation" || ssl === "initializing") {
    return "issuing certificate";
  }
  if (ssl === "pending_issuance" || ssl === "pending_deployment") {
    return "installing HTTPS";
  }
  if (d.cfId) return "waiting on certificate";
  return "waiting for DNS";
}

/** Show TXT/CNAME until validation has moved past DNS. */
export function needsDns(d) {
  if (d.status === "active") return false;
  const ssl = String(d.sslStatus || "").toLowerCase();
  if (ssl === "pending_issuance" || ssl === "pending_deployment" || ssl === "active") {
    return false;
  }
  return true;
}

function phaseDetail(d) {
  if (d.status === "active" || d.status === "error") return "";
  const err = String(d.error || "");
  if (err && !/cname/i.test(err)) return err;
  return "";
}

function hintDomainAuth(status, body) {
  if (status === 401 || status === 403) {
    if (body?.error === "domain_gated") return;
    note("Domains need a claimed site you own.");
    note("Claim on the live URL, then: aft login");
  }
}
