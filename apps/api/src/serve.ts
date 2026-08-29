import type { Env } from "./env";
import { RESERVED_SLUGS } from "./env";
import {
  BRAND,
  BRAND_CSS_VARS,
  BRAND_FONT_LINKS,
  BRAND_WORDMARK_CSS,
} from "./brand";
import {
  deployExists,
  getLatestRunJobBySlug,
  getSiteRow,
  touchLastServed,
  type RunJobPhase,
} from "./db";
import { corsHeaders, json } from "./http";
import { trackPageView, trackServe } from "./metrics";
import { injectAftChrome } from "./aft-chrome";
import { ensureDefaultOgMeta, isHtmlContentType } from "./og";
import { isJunkPath } from "./junk-path";
import { queueOwnerLog } from "./site-logs";
import { renderSiteOgImage, siteOgImagePath } from "./og-image";
import { proxyUpstream } from "./runtimes/proxy";
import {
  isEphemeralContainerOrigin,
  rebindContainerOrigin,
  tunnelOriginDead,
} from "./container-origin";
import { canAccessSite, privateDeniedHtml } from "./sharing";
import { getObject } from "./storage";
import { deployPreviewHost, isSmokeSlug, liveSiteHost } from "./site-url";
import { siteThumbPath } from "./thumb";
import { resolveSessionUser } from "./auth";
import {
  ME_PATH,
  SIGN_IN_PATH,
  SIGN_OUT_PATH,
  applyAftIdentityHeaders,
  handleAftIdentityRequest,
} from "./aft-identity";

function pageTitleFromHtml(html: string, fallback: string): string {
  const match = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  const title = match?.[1]?.replace(/\s+/g, " ").trim();
  return title || fallback;
}

function servePath(pathname: string): string {
  if (!pathname || pathname === "/") return "/";
  return pathname.startsWith("/") ? pathname : `/${pathname}`;
}

function looksLikeDocumentPath(pathname: string): boolean {
  const p = servePath(pathname);
  if (p.endsWith("/")) return true;
  const last = p.split("/").pop() || "";
  return !last.includes(".") || /\.html?$/i.test(last);
}

function bodyBytes(body: ArrayBuffer | ReadableStream): number {
  return body instanceof ArrayBuffer ? body.byteLength : 0;
}

function noteServe(
  env: Env,
  request: Request,
  slug: string,
  opts: {
    httpStatus: number;
    path?: string;
    bytes?: number;
    persist?: boolean;
  },
): void {
  trackServe(env, request, slug, opts);
  if (opts.persist !== false) queueOwnerLog(env, request, slug, opts);
}

export async function serveSite(
  request: Request,
  env: Env,
  slug: string,
  pathname: string,
  pinDeployId?: string,
): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(null, false) });
  }

  if (RESERVED_SLUGS.has(slug)) {
    return json({ error: "reserved" }, 404);
  }

  const root = env.ROOT_DOMAIN || "aft.page";
  const url = new URL(request.url);
  const identityPath = url.pathname.replace(/\/+$/, "") || "/";
  if (identityPath === SIGN_IN_PATH || identityPath === SIGN_OUT_PATH) {
    const viewer = await resolveSessionUser(env, request);
    const identity = handleAftIdentityRequest(request, env, slug, viewer);
    if (identity) return identity;
  }

  const access = await canAccessSite(env, request, slug);
  if (!access.allowed) {
    const headers = new Headers({
      "cache-control": "private, no-store",
      "x-aft-slug": slug,
    });
    for (const [name, value] of corsHeaders(null, false)) {
      headers.set(name, value);
    }

    if (!access.authenticated) {
      const next = new URL(request.url);
      next.hostname = liveSiteHost(slug, root);
      next.protocol = "https:";
      const login = new URL(`https://${root}/login`);
      login.searchParams.set("next", next.toString());
      headers.set("location", login.toString());
      noteServe(env, request, slug, {
        httpStatus: 302,
        path: servePath(pathname),
      });
      return new Response(null, { status: 302, headers });
    }

    headers.set("content-type", "text/html; charset=utf-8");
    noteServe(env, request, slug, {
      httpStatus: 401,
      path: servePath(pathname),
    });
    return new Response(privateDeniedHtml(slug, root), {
      status: 401,
      headers,
    });
  }

  if (identityPath === ME_PATH) {
    const identity = handleAftIdentityRequest(request, env, slug, access.user);
    if (identity) return identity;
  }

  const raw = await env.SITES.get(`site:${slug}`);
  if (!raw) {
    const pending = await resolveSitePending(env, slug);
    if (pending) {
      noteServe(env, request, slug, {
        httpStatus: 202,
        path: servePath(pathname),
        persist: false,
      });
      return sitePendingResponse(request, slug, root, pending);
    }
    noteServe(env, request, slug, {
      httpStatus: 404,
      path: servePath(pathname),
      persist: false,
    });
    return siteNotFoundResponse(request, slug, root);
  }
  const meta = JSON.parse(raw) as {
    deployId: string;
    runtime?: string;
    upstreamUrl?: string | null;
    badge?: boolean;
  };

  const siteRow = await getSiteRow(env, slug);

  if (pinDeployId && !(await deployExists(env, slug, pinDeployId))) {
    noteServe(env, request, slug, {
      httpStatus: 404,
      path: servePath(pathname),
      persist: false,
    });
    return new Response("Not found", {
      status: 404,
      headers: {
        "content-type": "text/plain; charset=utf-8",
        "cache-control": "no-store",
        "x-aft-slug": slug,
        "x-aft-deploy": pinDeployId,
        ...Object.fromEntries(corsHeaders(null, false)),
      },
    });
  }

  const deployId = pinDeployId || meta.deployId;

  // Deactivated: files are kept, but serving is paused until the owner flips it
  // back on from the dashboard. Return a friendly page instead of the content.
  if (siteRow && siteRow.active === false) {
    const headers = new Headers({
      "content-type": "text/html; charset=utf-8",
      "cache-control": "private, no-store",
      "x-aft-slug": slug,
      "x-aft-active": "0",
    });
    for (const [name, value] of corsHeaders(null, false)) {
      headers.set(name, value);
    }
    noteServe(env, request, slug, {
      httpStatus: 503,
      path: servePath(pathname),
    });
    return new Response(sitePausedHtml(slug, root), { status: 503, headers });
  }

  if (isJunkPath(pathname)) {
    noteServe(env, request, slug, {
      httpStatus: 404,
      path: servePath(pathname),
    });
    return new Response("Not found", {
      status: 404,
      headers: {
        "content-type": "text/plain; charset=utf-8",
        "cache-control": "no-store",
        "x-aft-slug": slug,
        ...Object.fromEntries(corsHeaders(null, false)),
      },
    });
  }

  const runtime = siteRow?.runtime || meta.runtime || "static";
  const upstreamUrl = siteRow?.upstreamUrl || meta.upstreamUrl || null;

  if (!pinDeployId && upstreamUrl && (runtime === "worker" || runtime === "next")) {
    void touchLastServed(env, slug);
    let res: Response;
    if (isEphemeralContainerOrigin(upstreamUrl)) {
      const replay = request.clone();
      try {
        res = await proxyUpstream(request, upstreamUrl, access.user);
      } catch {
        res = new Response("origin unreachable", { status: 530 });
      }
      if (tunnelOriginDead(res.status)) {
        const next = await rebindContainerOrigin(env, slug);
        if (next) {
          await res.body?.cancel().catch(() => null);
          res = await proxyUpstream(replay, next, access.user);
          // ponytail: Quick Tunnel DNS can 530 for ~15–20s after mint. This loop waits up to 12s on the same hostname; first GET can still 530, the next GET on the stable *.aft.page URL recovers. Upgrade: probe origin before swapping KV.
          if (res.status === 530) {
            const deadline = Date.now() + 12_000;
            while (res.status === 530 && Date.now() < deadline) {
              await scheduler.wait(2000);
              res = await proxyUpstream(request.clone(), next, access.user);
            }
          }
        }
      }
    } else {
      res = await proxyUpstream(request, upstreamUrl, access.user);
    }
    const path = servePath(pathname);
    noteServe(env, request, slug, {
      httpStatus: res.status,
      path,
    });
    if (looksLikeDocumentPath(pathname) && res.status === 200) {
      await trackPageView(env, request, slug, {
        path,
        contentType: res.headers.get("content-type") || "",
        httpStatus: res.status,
      });
    }
    const headers = new Headers(res.headers);
    headers.set("x-aft-slug", slug);
    return new Response(res.body, {
      status: res.status,
      statusText: res.statusText,
      headers,
    });
  }

  if (pathname.startsWith("/api/")) {
    noteServe(env, request, slug, {
      httpStatus: 404,
      path: servePath(pathname),
    });
    return new Response(JSON.stringify({ error: "not_found", runtime }), {
      status: 404,
      headers: {
        "content-type": "application/json; charset=utf-8",
        ...Object.fromEntries(corsHeaders(null, false)),
      },
    });
  }

  let path = decodeURIComponent(pathname);
  if (path.endsWith("/")) path += "index.html";
  if (path === "/" || path === "") path = "/index.html";
  path = path.replace(/^\//, "");

  if (path === siteOgImagePath()) {
    let title = slug;
    const index = await getObject(env, slug, deployId, "index.html");
    if (index) {
      title = pageTitleFromHtml(await new Response(index.body).text(), slug);
    }
    const img = await renderSiteOgImage({ title, slug, rootDomain: root });
    img.headers.set("x-aft-slug", slug);
    img.headers.set("x-aft-deploy", deployId);
    for (const [name, value] of corsHeaders(null, false)) {
      img.headers.set(name, value);
    }
    noteServe(env, request, slug, {
      httpStatus: 200,
      path: servePath(pathname),
    });
    return img;
  }

  if (path === siteThumbPath()) {
    const thumb = await getObject(env, slug, deployId, siteThumbPath());
    if (!thumb) {
      noteServe(env, request, slug, {
        httpStatus: 404,
        path: servePath(pathname),
      });
      return new Response("Not found", { status: 404 });
    }
    const headers = new Headers({
      "content-type": thumb.contentType || "image/jpeg",
      "cache-control": "public, max-age=86400, stale-while-revalidate=604800",
      "x-aft-slug": slug,
      "x-aft-deploy": deployId,
    });
    for (const [name, value] of corsHeaders(null, false)) {
      headers.set(name, value);
    }
    noteServe(env, request, slug, {
      httpStatus: 200,
      path: servePath(pathname),
      bytes: bodyBytes(thumb.body),
    });
    return new Response(thumb.body, { status: 200, headers });
  }

  let obj = await getObject(env, slug, deployId, path);
  if (!obj && !path.includes(".")) {
    obj = await getObject(env, slug, deployId, `${path}/index.html`);
  }
  if (!obj && path !== "index.html") {
    obj = await getObject(env, slug, deployId, "index.html");
  }
  if (!obj) {
    noteServe(env, request, slug, {
      httpStatus: 404,
      path: servePath(pathname),
    });
    return new Response("Not found", { status: 404 });
  }

  void touchLastServed(env, slug);

  const headers = new Headers();
  headers.set("content-type", obj.contentType);
  headers.set(
    "cache-control",
    access.user || access.role ? "private, no-store" : "public, max-age=60",
  );
  headers.set("x-aft-slug", slug);
  headers.set("x-aft-deploy", deployId);
  headers.set("x-aft-runtime", runtime);
  if (pinDeployId) headers.set("x-aft-preview", "1");
  applyAftIdentityHeaders(headers, access.user);
  for (const [name, value] of corsHeaders(null, false)) {
    headers.set(name, value);
  }
  const bytes = bodyBytes(obj.body);
  noteServe(env, request, slug, {
    httpStatus: 200,
    path: servePath(pathname),
    bytes,
    persist: !pinDeployId,
  });
  if (!pinDeployId) {
    await trackPageView(env, request, slug, {
      path: servePath(pathname),
      contentType: obj.contentType,
      httpStatus: 200,
    });
  }

  let body: ArrayBuffer | ReadableStream | string = obj.body;
  if (isHtmlContentType(obj.contentType)) {
    const html = await new Response(obj.body).text();
    const sitePath = pathname.startsWith("/") ? pathname : `/${pathname}`;
    const host =
      (pinDeployId && deployPreviewHost(slug, deployId, root)) ||
      liveSiteHost(slug, root);
    const publicUrl = `https://${host}${sitePath || "/"}`;
    let out = ensureDefaultOgMeta(html, {
      slug,
      pageUrl: publicUrl,
      rootDomain: root,
    });
    out = injectAftChrome(out, {
      slug,
      rootDomain: root,
      showBadge: meta.badge !== false,
    });
    if (isSmokeSlug(slug) || pinDeployId) out = ensureSmokeNoindex(out);
    body = out;
  }

  return new Response(body, { status: 200, headers });
}

function ensureSmokeNoindex(html: string): string {
  if (/<meta[^>]+name=["']robots["']/i.test(html)) return html;
  if (/<head[^>]*>/i.test(html)) {
    return html.replace(
      /<head[^>]*>/i,
      (m) => `${m}<meta name="robots" content="noindex"/>`,
    );
  }
  if (/<html[^>]*>/i.test(html)) {
    return html.replace(
      /<html[^>]*>/i,
      (m) => `${m}<head><meta name="robots" content="noindex"/></head>`,
    );
  }
  return `<head><meta name="robots" content="noindex"/></head>${html}`;
}

const PENDING_PHASE_LABEL: Record<RunJobPhase, string> = {
  queued: "Queued",
  cloning: "Cloning repo",
  installing: "Installing packages",
  building: "Building",
  deploying: "Deploying",
  live: "Going live…",
  failed: "Failed",
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

type SitePending = {
  phase: RunJobPhase;
  label: string;
  repo?: string;
  logTail?: string;
  jobId?: string;
};

async function resolveSitePending(
  env: Env,
  slug: string,
): Promise<SitePending | null> {
  const job = await getLatestRunJobBySlug(env, slug);
  if (job?.status === "queued") {
    const phase = job.phase === "live" || job.phase === "failed" ? "queued" : job.phase;
    return {
      phase,
      label: PENDING_PHASE_LABEL[phase],
      repo: `${job.owner}/${job.repo}`,
      logTail: job.logTail || undefined,
      jobId: job.id,
    };
  }
  if (job?.status === "live") {
    return {
      phase: "live",
      label: PENDING_PHASE_LABEL.live,
      repo: `${job.owner}/${job.repo}`,
      logTail: job.logTail || undefined,
      jobId: job.id,
    };
  }
  const site = await getSiteRow(env, slug);
  if (site) {
    return { phase: "live", label: PENDING_PHASE_LABEL.live };
  }
  return null;
}

const PENDING_STEPS: RunJobPhase[] = [
  "queued",
  "cloning",
  "installing",
  "building",
  "deploying",
  "live",
];

function pendingStepIndex(phase: RunJobPhase): number {
  const i = PENDING_STEPS.indexOf(phase);
  return i >= 0 ? i : 0;
}

/** KV miss while a Run job (or D1 site row) says this slug is coming online. */
export function sitePendingHtml(
  slug: string,
  root: string,
  pending: SitePending,
): string {
  const host = liveSiteHost(slug, root);
  const repo = pending.repo ? escapeHtml(pending.repo) : "";
  const log = pending.logTail ? escapeHtml(pending.logTail) : "";
  const label = escapeHtml(pending.label);
  const jobId = pending.jobId ? escapeHtml(pending.jobId) : "";
  const active = pendingStepIndex(pending.phase);
  const steps = PENDING_STEPS.map((p, i) => {
    const state = i < active ? "done" : i === active ? "now" : "todo";
    return `<li class="${state}" data-step="${p}"><span class="dot" aria-hidden="true"></span>${escapeHtml(PENDING_PHASE_LABEL[p])}</li>`;
  }).join("");
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><meta name="robots" content="noindex"/><meta name="theme-color" content="${BRAND.void}"/><title>${label} — aft.page</title>
${BRAND_FONT_LINKS}
<style>
${BRAND_CSS_VARS}
*{box-sizing:border-box}body{margin:0;font:15px/1.5 var(--font-sans);color:var(--ink);background:var(--void);min-height:100vh;display:flex;align-items:center;justify-content:center;padding:1.25rem;-webkit-font-smoothing:antialiased}
main{width:min(40rem,100%)}
${BRAND_WORDMARK_CSS}
.brand{display:inline-block;margin:0 0 1.25rem;font-size:1.15rem}
.head{text-align:center;margin:0 0 1.25rem}
.spinner{width:3.5rem;height:3.5rem;margin:0 auto 1.1rem;border:3px solid var(--line-bright);border-top-color:var(--ink);border-radius:50%;animation:spin .65s linear infinite}
main.failed .spinner,main.live .spinner{display:none}
@keyframes spin{to{transform:rotate(360deg)}}
.badge{display:inline-block;margin:0 0 .65rem;padding:.25rem .7rem;border:1px solid var(--line-bright);border-radius:999px;font-size:.72rem;font-weight:650;letter-spacing:.06em;text-transform:uppercase;color:var(--quiet)}
main.failed .badge{border-color:#7f1d1d;color:#fca5a5}
main.live .badge{border-color:#14532d;color:#86efac}
h1{font-size:1.45rem;margin:0 0 .4rem;font-weight:650;letter-spacing:-.02em}
.meta{color:var(--quiet);margin:0;font-size:.9rem}.meta strong{color:var(--ink)}
.fail{display:none;margin:0 0 1rem;padding:.85rem 1rem;border:1px solid #7f1d1d;border-radius:8px;background:#1c0a0a;color:#fecaca;text-align:left;font-size:.9rem;white-space:pre-wrap;word-break:break-word}
main.failed .fail{display:block}
.steps{list-style:none;margin:0 0 1rem;padding:0;display:grid;gap:.35rem}
.steps li{display:flex;align-items:center;gap:.55rem;padding:.35rem .5rem;border-radius:6px;font-size:.88rem;color:var(--faint)}
.steps li .dot{width:.55rem;height:.55rem;border-radius:50%;background:var(--line-bright);flex:0 0 auto}
.steps li.done{color:var(--quiet)}.steps li.done .dot{background:#3f3f46}
.steps li.now{color:var(--ink);font-weight:650;background:rgba(255,255,255,.04)}.steps li.now .dot{background:var(--ink);box-shadow:0 0 0 3px rgba(255,255,255,.12)}
.steps li.bad{color:#fca5a5}.steps li.bad .dot{background:#f87171}
.panel{border:1px solid var(--line);border-radius:10px;overflow:hidden;background:#0a0a0a}
.panel-h{display:flex;align-items:center;justify-content:space-between;gap:.75rem;flex-wrap:wrap;padding:.55rem .85rem;border-bottom:1px solid var(--line);font:650 .72rem/1 var(--font-mono);letter-spacing:.06em;text-transform:uppercase;color:var(--quiet)}
.panel-h .pulse{display:inline-flex;align-items:center;gap:.4rem}
.panel-h .pulse i{width:.45rem;height:.45rem;border-radius:50%;background:var(--ink);animation:blink 1.1s ease-in-out infinite}
@keyframes blink{50%{opacity:.25}}
.panel-h a{color:var(--quiet);text-decoration:underline;text-underline-offset:2px;text-transform:none;letter-spacing:0;font-weight:500}
.log{margin:0;max-height:min(28rem,55vh);overflow:auto;padding:.85rem 1rem;font:12px/1.5 var(--font-mono);color:#d4d4d8;white-space:pre-wrap;word-break:break-word;min-height:8rem}
.log:empty::before{content:"Waiting for build output…";color:var(--faint)}
.conn{margin:.65rem 0 0;font:12px/1.4 var(--font-mono);color:var(--faint)}
.conn.ok{color:#86efac}.conn.bad{color:#fca5a5}
.hint{margin:1rem 0 0;text-align:center;font-size:.85rem;color:var(--faint)}.hint a{color:var(--ink);text-decoration:underline;text-underline-offset:3px}
</style></head><body>
<main data-pending data-slug="${escapeHtml(slug)}" data-job="${jobId}" data-phase="${pending.phase}">
  <div class="head">
    <a class="brand" href="https://${root}/">aft<span>.</span>page</a>
    <div class="spinner" role="status" aria-label="Build in progress"></div>
    <div class="badge" id="badge">Build in progress</div>
    <h1 id="phase-label">${label}</h1>
    <p class="meta"><strong id="host">${escapeHtml(host)}</strong>${repo ? ` · <span id="repo">${repo}</span>` : ""}</p>
  </div>
  <p class="fail" id="fail" role="alert"></p>
  <ul class="steps" id="steps" aria-label="Build phases">${steps}</ul>
  <div class="panel">
    <div class="panel-h">
      <span class="pulse"><i></i> Live log · SSE</span>
      <span id="phase-chip">${label}</span>
      ${jobId ? `<a id="job-link" href="https://api.${root}/v1/jobs/${jobId}" target="_blank" rel="noopener noreferrer">${jobId}</a>` : ""}
    </div>
    <pre class="log" id="log" aria-live="polite">${log}</pre>
  </div>
  <p class="conn" id="conn">Connecting to build stream…</p>
  <p class="hint">Realtime build stream. Watch on <a href="https://${root}/run/">aft.page/run</a> too.</p>
</main>
<script>
(function () {
  var root = ${JSON.stringify(root)};
  var labels = ${JSON.stringify(PENDING_PHASE_LABEL)};
  var order = ${JSON.stringify(PENDING_STEPS)};
  var main = document.querySelector("[data-pending]");
  if (!main) return;
  var jobId = main.getAttribute("data-job") || "";
  var logEl = document.getElementById("log");
  var labelEl = document.getElementById("phase-label");
  var chipEl = document.getElementById("phase-chip");
  var stepsEl = document.getElementById("steps");
  var badgeEl = document.getElementById("badge");
  var failEl = document.getElementById("fail");
  var connEl = document.getElementById("conn");
  var es = null;
  var settled = false;
  var siteTimer = null;

  function setConn(text, kind) {
    connEl.textContent = text;
    connEl.className = "conn" + (kind ? " " + kind : "");
  }

  function paintSteps(phase, failed) {
    var active = order.indexOf(phase);
    if (active < 0) active = 0;
    var items = stepsEl.querySelectorAll("li");
    for (var i = 0; i < items.length; i++) {
      if (failed && i === active) items[i].className = "bad";
      else items[i].className = i < active ? "done" : i === active ? "now" : "todo";
    }
  }

  function apply(snap) {
    if (!snap || snap.error === "not_found") return;
    var phase = snap.phase || main.getAttribute("data-phase") || "queued";
    var label = labels[phase] || phase;
    main.setAttribute("data-phase", phase);
    if (snap.status !== "failed") {
      labelEl.textContent = label;
      chipEl.textContent = label;
      document.title = label + " — aft.page";
    }
    paintSteps(phase, snap.status === "failed");
    if (typeof snap.logTail === "string" && snap.logTail) {
      var atBottom = logEl.scrollHeight - logEl.scrollTop - logEl.clientHeight < 48;
      logEl.textContent = snap.logTail;
      if (atBottom) logEl.scrollTop = logEl.scrollHeight;
    } else if (snap.line) {
      var cur = logEl.textContent || "";
      if (!cur.endsWith(snap.line)) {
        logEl.textContent = cur ? cur + "\\n" + snap.line : snap.line;
        logEl.scrollTop = logEl.scrollHeight;
      }
    }
    if (snap.status === "failed") {
      settled = true;
      main.classList.add("failed");
      badgeEl.textContent = "Build failed";
      var why = snap.reason || snap.error || "Build failed.";
      labelEl.textContent = why;
      chipEl.textContent = "Failed";
      document.title = "Failed — aft.page";
      failEl.textContent = why + (snap.error && snap.reason ? "\\n(" + snap.error + ")" : "");
      setConn("Stream ended · failed", "bad");
      if (es) { es.close(); es = null; }
      return;
    }
    if (snap.status === "live") {
      settled = true;
      main.classList.add("live");
      badgeEl.textContent = "Going live";
      labelEl.textContent = "Going live…";
      chipEl.textContent = "Going live…";
      setConn("Build finished · waiting for edge…", "ok");
      if (es) { es.close(); es = null; }
      waitForSite();
    }
  }

  async function waitForSite() {
    if (siteTimer) return;
    siteTimer = setInterval(async function () {
      try {
        var site = await fetch(location.origin + "/", {
          cache: "no-store",
          headers: { accept: "text/html" },
        });
        if (site.ok) {
          clearInterval(siteTimer);
          location.reload();
        }
      } catch (_) {}
    }, 1000);
  }

  function connectSse() {
    if (!jobId || settled) return;
    if (es) { try { es.close(); } catch (_) {} }
    setConn("SSE connected · streaming…", "ok");
    es = new EventSource("https://api." + root + "/v1/jobs/" + encodeURIComponent(jobId) + "/events");
    es.onmessage = function (ev) {
      try { apply(JSON.parse(ev.data)); } catch (_) {}
    };
    es.onerror = function () {
      if (settled) return;
      setConn("SSE reconnecting…", "bad");
      try { es.close(); } catch (_) {}
      es = null;
      setTimeout(connectSse, 1200);
    };
  }

  if (logEl) logEl.scrollTop = logEl.scrollHeight;
  if (jobId) connectSse();
  else {
    setConn("No job id · refreshing page…", "bad");
    setTimeout(function () { location.reload(); }, 3000);
  }
})();
</script>
</body></html>`;
}

function sitePendingResponse(
  request: Request,
  slug: string,
  root: string,
  pending: SitePending,
): Response {
  const extra: Record<string, string> = {
    "cache-control": "no-store",
    "x-aft-slug": slug,
    "x-aft-error": "SITE_PENDING",
    "x-aft-phase": pending.phase,
    "retry-after": "2",
    vary: "Accept",
  };
  if (!wantsHtml(request)) {
    return json(
      {
        error: "pending",
        code: "SITE_PENDING",
        slug,
        phase: pending.phase,
        label: pending.label,
        jobId: pending.jobId || null,
        logTail: pending.logTail || null,
      },
      202,
      extra,
    );
  }
  const headers = new Headers({
    "content-type": "text/html; charset=utf-8",
    ...extra,
  });
  for (const [name, value] of corsHeaders(null, false)) {
    headers.set(name, value);
  }
  return new Response(sitePendingHtml(slug, root, pending), {
    status: 202,
    headers,
  });
}

/** Platform 404: hostname resolved, nothing deployed at this slug. */
export function siteNotFoundHtml(slug: string, root: string): string {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><meta name="robots" content="noindex"/><meta name="theme-color" content="${BRAND.void}"/><title>Not deployed — aft.page</title>
${BRAND_FONT_LINKS}
<style>
${BRAND_CSS_VARS}
*{box-sizing:border-box}body{margin:0;font:15px/1.5 var(--font-sans);color:var(--ink);background:var(--void);min-height:100vh;display:flex;align-items:center;justify-content:center;padding:1.25rem;-webkit-font-smoothing:antialiased}
main{width:min(24rem,100%);text-align:center}
${BRAND_WORDMARK_CSS}
.brand{display:inline-block;margin:0 0 1.5rem;font-size:1.15rem}
.badge{display:inline-block;margin:0 0 1rem;padding:.2rem .6rem;border:1px solid var(--line-bright);border-radius:999px;font-size:.72rem;font-weight:650;letter-spacing:.06em;text-transform:uppercase;color:var(--quiet)}
h1{font-size:1.25rem;margin:0 0 .5rem;font-weight:600}
p{color:var(--quiet);margin:0 0 1rem}p strong{color:var(--ink)}
.hint{margin-top:1.25rem;font-size:.85rem;color:var(--faint)}.hint a{color:var(--ink);text-decoration:underline;text-underline-offset:3px}
</style></head><body>
<main>
  <a class="brand" href="https://${root}/">aft<span>.</span>page</a>
  <div class="badge">Not found</div>
  <h1>Nothing is deployed here</h1>
  <p><strong>${liveSiteHost(slug, root)}</strong> has no site yet.</p>
  <p class="hint">Deploy from your agent, or go to <a href="https://${root}/">aft.page</a>.</p>
</main>
</body></html>`;
}

function wantsHtml(request: Request): boolean {
  return (request.headers.get("accept") || "").includes("text/html");
}

function siteNotFoundResponse(
  request: Request,
  slug: string,
  root: string,
): Response {
  const extra: Record<string, string> = {
    "cache-control": "no-store",
    "x-aft-slug": slug,
    "x-aft-error": "SITE_NOT_FOUND",
    vary: "Accept",
  };
  if (!wantsHtml(request)) {
    return json(
      { error: "not_found", code: "SITE_NOT_FOUND", slug },
      404,
      extra,
    );
  }
  const headers = new Headers({
    "content-type": "text/html; charset=utf-8",
    ...extra,
  });
  for (const [name, value] of corsHeaders(null, false)) {
    headers.set(name, value);
  }
  return new Response(siteNotFoundHtml(slug, root), { status: 404, headers });
}

/** Shown when a site is deactivated: files are safe, serving is paused. */
export function sitePausedHtml(slug: string, root: string): string {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><meta name="robots" content="noindex"/><meta name="theme-color" content="${BRAND.void}"/><title>Site paused — aft.page</title>
${BRAND_FONT_LINKS}
<style>
${BRAND_CSS_VARS}
*{box-sizing:border-box}body{margin:0;font:15px/1.5 var(--font-sans);color:var(--ink);background:var(--void);min-height:100vh;display:flex;align-items:center;justify-content:center;padding:1.25rem;-webkit-font-smoothing:antialiased}
main{width:min(24rem,100%);text-align:center}
${BRAND_WORDMARK_CSS}
.brand{display:inline-block;margin:0 0 1.5rem;font-size:1.15rem}
.badge{display:inline-block;margin:0 0 1rem;padding:.2rem .6rem;border:1px solid var(--line-bright);border-radius:999px;font-size:.72rem;font-weight:650;letter-spacing:.06em;text-transform:uppercase;color:var(--quiet)}
h1{font-size:1.25rem;margin:0 0 .5rem;font-weight:600}
p{color:var(--quiet);margin:0 0 1rem}p strong{color:var(--ink)}
.hint{margin-top:1.25rem;font-size:.85rem;color:var(--faint)}.hint a{color:var(--ink);text-decoration:underline;text-underline-offset:3px}
</style></head><body>
<main>
  <a class="brand" href="https://${root}/">aft<span>.</span>page</a>
  <div class="badge">Paused</div>
  <h1>This site is paused</h1>
  <p><strong>${slug}.${root}</strong> has been deactivated by its owner. Its files are still safe — it just isn’t serving right now.</p>
  <p class="hint">Are you the owner? Reactivate it from your <a href="https://${root}/projects">projects</a>.</p>
</main>
</body></html>`;
}
