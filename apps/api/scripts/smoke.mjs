#!/usr/bin/env node
/**
 * Prod smoke: Worker suite (ops /api/smoke/run) then MCP JSON-RPC from Node.
 * tools/call cannot run inside the API isolate (API→MCP→API deadlocks).
 */
const secret = (process.env.SMOKE_SECRET || "").trim();
if (!secret) {
  console.error("SMOKE_SECRET is required");
  process.exit(1);
}
const base = (process.env.SMOKE_URL || "https://ops.aft.page/api/smoke/run").trim();
const mcpUrl = (process.env.MCP_URL || "https://mcp.aft.page/mcp").trim();
const domainsUrl = base.replace(/\/run\/?$/, "/domains");
const flightUrl = base.replace(/\/run\/?$/, "/flight");

const res = await fetch(base, {
  method: "POST",
  headers: {
    authorization: `Bearer ${secret}`,
    "x-aft-skip-flight": "1",
  },
  signal: AbortSignal.timeout(120_000),
});
let body;
try {
  body = await res.json();
} catch {
  console.error(`smoke http ${res.status} (non-json)`);
  process.exit(1);
}
console.log(JSON.stringify(body, null, 2));
const workerOk = res.ok && body?.ok;

const flight = {};
let pagesOk = false;
try {
  const claim = await fetch("https://aft.page/claim", {
    signal: AbortSignal.timeout(10_000),
  });
  const text = await claim.text();
  pagesOk = claim.status === 200 && /claim/i.test(text);
  flight.claimPage = { ok: pagesOk, status: claim.status };
  if (!pagesOk) console.error(`GET /claim ${claim.status}`);
} catch (err) {
  flight.claimPage = { ok: false, status: 0 };
  console.error("claim page:", err instanceof Error ? err.message : err);
}

let mcpOk = false;
try {
  flight.mcp = await runMcpSmoke(mcpUrl);
  mcpOk = flight.mcp.ok === true;
} catch (err) {
  flight.mcp = { ok: false, error: err instanceof Error ? err.message : String(err) };
  console.error("mcp smoke:", flight.mcp.error);
}

let serveOk = false;
try {
  flight.serve = await probePublicServe();
  serveOk = flight.serve.ok === true;
} catch (err) {
  flight.serve = { ok: false, error: err instanceof Error ? err.message : String(err) };
  console.error("serve smoke:", flight.serve.error);
}

let domainsOk = false;
try {
  flight.domains = await probeCustomDomains(domainsUrl, secret);
  domainsOk = flight.domains.ok === true;
} catch (err) {
  flight.domains = { ok: false, error: err instanceof Error ? err.message : String(err) };
  console.error("domains smoke:", flight.domains.error);
}

if (body?.id) {
  try {
    const posted = await fetch(flightUrl, {
      method: "POST",
      headers: {
        authorization: `Bearer ${secret}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ runId: body.id, flight }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!posted.ok) console.error(`flight persist ${posted.status}`);
  } catch (err) {
    console.error("flight persist:", err instanceof Error ? err.message : err);
  }
}

if (!workerOk || !pagesOk || !mcpOk || !serveOk || !domainsOk) process.exit(1);

async function probePublicServe() {
  const html = await fetchUrl("https://test--html.aft.page/");
  if (html.status !== 200 || !html.text.includes("aft-smoke-html")) {
    throw new Error(`html canary ${html.status}`);
  }
  const files = await fetchUrl("https://test--files.aft.page/");
  if (files.status !== 200 || !files.text.includes("aft-smoke-html-files")) {
    throw new Error(`files canary ${files.status}`);
  }
  const priv = await fetchUrl("https://test--priv.aft.page/", { redirect: "manual" });
  if (priv.status !== 302 || !/login/i.test(priv.location || "")) {
    throw new Error(`priv canary ${priv.status} ${priv.location || ""}`);
  }
  const serve = {
    ok: true,
    html: "https://test--html.aft.page",
    files: "https://test--files.aft.page",
    priv: 302,
  };
  console.log(JSON.stringify({ serve }, null, 2));
  return serve;
}

function domainSslLive(d) {
  if (d.status !== "active") return false;
  const ssl = d.sslStatus || "";
  return !ssl || ssl === "active" || ssl === "pending_deployment";
}

async function probeCustomDomains(url, bearer) {
  const res = await fetch(url, {
    headers: { authorization: `Bearer ${bearer}` },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`domains list ${res.status}`);
  const payload = await res.json();
  const rows = Array.isArray(payload?.domains) ? payload.domains : [];
  const live = rows.filter(domainSslLive);
  const skipped = rows.length - live.length;
  const probes = [];
  for (const d of live) {
    const host = String(d.hostname || "").trim().toLowerCase();
    if (!host) continue;
    try {
      const hit = await fetchUrl(`https://${host}/`, { redirect: "manual" });
      // TLS handshake succeeded if we got here. 302 private / 404 empty is still serving.
      if (hit.status >= 500) {
        probes.push({ host, ok: false, status: hit.status });
      } else {
        probes.push({ host, ok: true, status: hit.status, ssl: d.sslStatus || "active" });
      }
    } catch (err) {
      probes.push({
        host,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  const failed = probes.filter((p) => !p.ok);
  const domains = {
    ok: failed.length === 0,
    total: rows.length,
    probed: probes.length,
    skipped,
    failed: failed.map((p) => p.host),
    probes,
  };
  console.log(JSON.stringify({ domains }, null, 2));
  if (failed.length) throw new Error(`custom domain ${failed.map((p) => p.host).join(",")}`);
  return domains;
}

async function fetchUrl(url, opts = {}) {
  const res = await fetch(url, {
    redirect: opts.redirect || "follow",
    headers: { accept: "text/html" },
    signal: AbortSignal.timeout(15_000),
  });
  const text = await res.text();
  return {
    status: res.status,
    text,
    location: res.headers.get("location"),
  };
}

async function runMcpSmoke(url) {
  // createMcpHandler is stateless — no mcp-session-id. Tool is `deploy` (ADR-MCP-THIN).
  await mcpRpc(url, "initialize", {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "aft-smoke", version: "0.1.0" },
  });
  await mcpRpc(url, "notifications/initialized", {}, { notify: true });
  const listed = await mcpRpc(url, "tools/list", {});
  const names = (listed.data?.result?.tools || []).map((t) => t.name);
  if (!names.includes("deploy")) throw new Error(`tools ${names.join(",")}`);
  const call = await mcpRpc(url, "tools/call", {
    name: "deploy",
    arguments: {
      html: "<!doctype html><html><body><p>aft-smoke-html-mcp</p></body></html>",
      preferred_slug: "test--mcp",
    },
  });
  const text = mcpText(call.data);
  if (call.data?.result?.isError || call.data?.error) throw new Error(text.slice(0, 300));
  if (!/claim/i.test(text)) throw new Error(`no claimUrl in ${text.slice(0, 200)}`);
  const live = await fetch("https://test--mcp.aft.page/", {
    headers: { accept: "text/html" },
    signal: AbortSignal.timeout(10_000),
  });
  const html = await live.text();
  if (live.status !== 200 || !html.includes("aft-smoke-html-mcp")) {
    throw new Error(`canary ${live.status}`);
  }
  const reserved = await mcpRpc(url, "tools/call", {
    name: "deploy",
    arguments: {
      html: "<!doctype html><p>nope</p>",
      preferred_slug: "ai",
    },
  });
  const rtext = mcpText(reserved.data);
  if (!reserved.data?.result?.isError && !/reserved/i.test(rtext)) {
    throw new Error(`expected reserved, got ${rtext.slice(0, 200)}`);
  }
  const mcp = {
    ok: true,
    tools: names,
    url: "https://test--mcp.aft.page",
    reserved: true,
  };
  console.log(JSON.stringify({ mcp }, null, 2));
  return mcp;
}

async function mcpRpc(url, method, params, opts = {}) {
  const payload = opts.notify
    ? { jsonrpc: "2.0", method, params }
    : { jsonrpc: "2.0", id: 1, method, params };
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(20_000),
  });
  if (opts.notify) return { data: null, status: res.status };
  const ct = res.headers.get("content-type") || "";
  let data;
  if (ct.includes("event-stream") && res.body) data = await readSse(res);
  else data = await res.json();
  return { data, status: res.status };
}

async function readSse(res) {
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  const deadline = Date.now() + 15_000;
  try {
    while (Date.now() < deadline) {
      const { done, value } = await reader.read();
      if (value) buf += dec.decode(value, { stream: true });
      const parsed = parseSse(buf);
      if (parsed) return parsed;
      if (done) break;
    }
  } finally {
    try {
      await reader.cancel();
    } catch {
      /* closed */
    }
  }
  return parseSse(buf) ?? { error: { message: buf.slice(0, 300) } };
}

function parseSse(text) {
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (!t.startsWith("data:")) continue;
    const raw = t.slice(5).trim();
    if (!raw || raw === "[DONE]") continue;
    try {
      return JSON.parse(raw);
    } catch {
      /* next */
    }
  }
  return null;
}

function mcpText(data) {
  const parts = (data?.result?.content || []).map((c) => c.text || "").filter(Boolean);
  if (parts.length) return parts.join("\n");
  return JSON.stringify(data ?? "");
}
