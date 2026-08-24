/** aft domain(s) — custom domains for a claimed site. */
import { apiFetch, readJson } from "./api.js";
import { requireLogin, resolveProject } from "./project.js";
import { note, ok, say, ui } from "./ui.js";

export async function cmdDomains(args = []) {
  const [sub, ...rest] = args;

  if (sub === "-h" || sub === "--help" || sub === "help") {
    console.log(`Usage:
  aft domains
  aft domain add app.example.com
  aft domain refresh app.example.com
  aft domain remove app.example.com
  aft domain request-access

Requires aft login and a claimed site.`);
    return;
  }

  await requireLogin();
  const { slug } = await resolveProject();

  switch (sub) {
    case undefined:
    case "list":
    case "ls":
      return listDomains(slug);
    case "add":
      return addDomain(slug, rest[0]);
    case "refresh":
      return refreshDomain(slug, rest[0]);
    case "remove":
    case "rm":
    case "delete":
      return removeDomain(slug, rest[0]);
    case "request-access":
      return requestAccess(slug);
    default:
      throw new Error(`Unknown aft domain command: ${sub}\nRun: aft domain --help`);
  }
}

async function listDomains(slug) {
  const res = await apiFetch(`/v1/sites/${encodeURIComponent(slug)}/domains`);
  const body = await readJson(res);
  if (!res.ok) {
    hintDomainAuth(res.status, body);
    throw new Error(body.hint || body.error || `domains failed (${res.status})`);
  }

  const domains = body.domains || [];
  const access = body.access || "none";
  const cname = body.cname || "cname.aft.page";

  if (domains.length === 0) {
    note(`No custom domains on ${slug}.aft.page`);
    if (access !== "approved") {
      note("Request access: aft domain request-access");
    } else {
      note("Add one: aft domain add app.example.com");
    }
    return;
  }

  say(`${ui.ebold(slug)} domains`);
  for (const d of domains) {
    const ssl = d.sslStatus ? ` ${ui.edim(d.sslStatus)}` : "";
    const err = d.error ? ` ${ui.edim(d.error)}` : "";
    console.log(`  ${d.hostname}  ${d.status}${ssl}${err}`);
    if (d.status !== "active") {
      if (d.txtName && d.txtValue) {
        console.log(`    TXT   ${d.txtName} = ${d.txtValue}`);
      }
      console.log(`    CNAME ${d.hostname} -> ${cname}`);
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
  ok(`${domain.hostname} (${domain.status})`);
  if (domain.status === "active") return;
  if (domain.txtName && domain.txtValue) {
    console.log(`TXT   ${domain.txtName} = ${domain.txtValue}`);
  }
  console.log(`CNAME ${domain.hostname} -> ${domain.cname}`);
  note("After DNS is live, run: aft domain refresh app.example.com");
}

function hintDomainAuth(status, body) {
  if (status === 401 || status === 403) {
    if (body?.error === "domain_gated") return;
    note("Domains need a claimed site you own.");
    note("Claim on the live URL, then: aft login");
  }
}
