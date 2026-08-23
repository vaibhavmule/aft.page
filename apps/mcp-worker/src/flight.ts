/**
 * Public smoke flight from this isolate (not aft-page-api).
 * Same-isolate API→MCP→API deadlocks — don't tools/call from API.
 * HTTPS to *.aft.page / SSL-for-SaaS needs global_fetch_strictly_public
 * or fetch hits originless 100:: (522 / timeout) instead of the Worker.
 */
type DomainRow = { hostname: string; status: string; sslStatus: string | null };

export type PublicFlight = {
  claimPage?: { ok: boolean; status?: number };
  serve?: { ok: boolean; html?: string; files?: string; priv?: number; error?: string };
  domains?: {
    ok: boolean;
    total?: number;
    probed?: number;
    skipped?: number;
    failed?: string[];
    probes?: { host: string; ok: boolean; status?: number; ssl?: string; error?: string }[];
    error?: string;
  };
};

export async function runPublicFlight(domainRows: DomainRow[]): Promise<PublicFlight> {
  const flight: PublicFlight = {};

  try {
    const claim = await fetch("https://aft.page/claim", {
      signal: AbortSignal.timeout(10_000),
    });
    const text = await claim.text();
    flight.claimPage = { ok: claim.status === 200 && /claim/i.test(text), status: claim.status };
  } catch (err) {
    flight.claimPage = { ok: false, status: 0 };
    console.error(JSON.stringify({ level: "error", where: "flight", step: "claim", err: String(err) }));
  }

  try {
    flight.serve = await probeServe();
  } catch (err) {
    flight.serve = { ok: false, error: err instanceof Error ? err.message : String(err) };
  }

  try {
    flight.domains = await probeDomains(domainRows);
  } catch (err) {
    flight.domains = { ok: false, error: err instanceof Error ? err.message : String(err) };
  }

  return flight;
}

async function probeServe(): Promise<NonNullable<PublicFlight["serve"]>> {
  const html = await hit("https://test--html.aft.page/");
  if (html.status !== 200 || !html.text.includes("aft-smoke-html")) {
    throw new Error(`html canary ${html.status}`);
  }
  const files = await hit("https://test--files.aft.page/");
  if (files.status !== 200 || !files.text.includes("aft-smoke-html-files")) {
    throw new Error(`files canary ${files.status}`);
  }
  const priv = await hit("https://test--priv.aft.page/", "manual");
  if (priv.status !== 302 || !/login/i.test(priv.location || "")) {
    throw new Error(`priv canary ${priv.status}`);
  }
  return {
    ok: true,
    html: "https://test--html.aft.page",
    files: "https://test--files.aft.page",
    priv: 302,
  };
}

function sslLive(d: DomainRow): boolean {
  if (d.status !== "active") return false;
  const ssl = d.sslStatus || "";
  return !ssl || ssl === "active" || ssl === "pending_deployment";
}

async function probeDomains(rows: DomainRow[]): Promise<NonNullable<PublicFlight["domains"]>> {
  const live = rows.filter(sslLive);
  const probes: NonNullable<PublicFlight["domains"]>["probes"] = [];
  for (const d of live) {
    const host = String(d.hostname || "").trim().toLowerCase();
    if (!host) continue;
    try {
      const hitRes = await hit(`https://${host}/`, "manual");
      if (hitRes.status >= 500) probes.push({ host, ok: false, status: hitRes.status });
      else probes.push({ host, ok: true, status: hitRes.status, ssl: d.sslStatus || "active" });
    } catch (err) {
      probes.push({ host, ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  }
  const failed = probes.filter((p) => !p.ok).map((p) => p.host);
  return {
    ok: failed.length === 0,
    total: rows.length,
    probed: probes.length,
    skipped: rows.length - live.length,
    failed,
    probes,
  };
}

async function hit(url: string, redirect: RequestInit["redirect"] = "follow"): Promise<{
  status: number;
  text: string;
  location: string | null;
}> {
  const res = await fetch(url, {
    redirect,
    headers: { accept: "text/html" },
    signal: AbortSignal.timeout(15_000),
  });
  return { status: res.status, text: await res.text(), location: res.headers.get("location") };
}
