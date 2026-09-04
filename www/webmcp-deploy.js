/**
 * aftWebmcpDeploy — WebMCP tools for the Drop (publish) and Run (repo deploy)
 * surfaces. These are the "make it real" tools: they call the SAME endpoints
 * the page's own UI calls (POST /v1/deploy, POST /v1/repo/deploy), so a tool
 * is never more powerful than the page. Every consequential tool requires a
 * same-origin human confirmation before it calls the API.
 *
 * Pure module (no DOM at import time); the confirm() gate is injected by the
 * caller (window.aftWebmcp.confirm) so this stays unit-testable.
 */
(function (root) {
  "use strict";

  const API = root.AFT_WEBMCP_API || "https://api.aft.page";
  const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,46}[a-z0-9])?$/;

  /** Derive a slug hint from an HTML <title>, like the Drop UI does. */
  function slugFromHtml(html) {
    const m = String(html || "").match(/<title[^>]*>([^<]*)<\/title>/i);
    const raw = (m && m[1] ? m[1] : "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48);
    return SLUG_RE.test(raw) ? raw : "";
  }

  /** Publish raw HTML → live URL (same as the Drop paste path). */
  async function execPublishHtml(input, ctx) {
    const html = String((input && input.html) || "").trim();
    if (!html) return { error: "html is required." };
    const preferredSlug = String((input && input.preferred_slug) || "").toLowerCase().trim();
    if (preferredSlug && !SLUG_RE.test(preferredSlug)) {
      return { error: "preferred_slug must be lowercase letters, digits, hyphens." };
    }
    const ok = await ctx.confirm({
      title: "Publish this page to aft.page?",
      message: `A new site will be created at https://${preferredSlug || slugFromHtml(html) || "…"}.aft.page.\n\nAnyone with the link can view it. You can claim it afterwards.`,
      confirmLabel: "Publish",
    });
    if (!ok) return { declined: true, message: "Publish declined." };

    const slug = preferredSlug || slugFromHtml(html);
    const endpoint = slug ? `${API}/v1/deploy?slug=${encodeURIComponent(slug)}` : `${API}/v1/deploy`;
    const res = await fetch(endpoint, {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "text/html; charset=utf-8", "x-aft-client": "web" },
      body: html,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.url) {
      return { error: data.reason || data.hint || data.message || data.error || `Publish failed (${res.status})` };
    }
    return {
      ok: true,
      url: data.url,
      slug: data.slug,
      deployId: data.deployId,
      editToken: data.editToken || null,
      claimUrl: data.claimUrl || null,
    };
  }

  /** Publish JSON files → live URL (same as the Drop files path). */
  async function execPublishFiles(input, ctx) {
    const files = Array.isArray(input && input.files) ? input.files : [];
    if (!files.length) return { error: "files is required (array of { path, content })." };
    if (files.length > 500) return { error: "Too many files (max 500)." };
    for (const f of files) {
      const path = String((f && f.path) || "");
      if (!path || path.includes("..") || path.startsWith("/") || path.includes("\\")) {
        return { error: `Invalid file path: ${path || "(empty)"}` };
      }
    }
    const preferredSlug = String((input && input.preferred_slug) || "").toLowerCase().trim();
    if (preferredSlug && !SLUG_RE.test(preferredSlug)) {
      return { error: "preferred_slug must be lowercase letters, digits, hyphens." };
    }
    const ok = await ctx.confirm({
      title: "Publish these files to aft.page?",
      message: `A new site (${files.length} file${files.length === 1 ? "" : "s"}) will be published${preferredSlug ? ` as https://${preferredSlug}.aft.page` : " to a new URL"}.\n\nAnyone with the link can view it.`,
      confirmLabel: "Publish",
    });
    if (!ok) return { declined: true, message: "Publish declined." };

    const slug = preferredSlug;
    const endpoint = slug ? `${API}/v1/deploy?slug=${encodeURIComponent(slug)}` : `${API}/v1/deploy`;
    const res = await fetch(endpoint, {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json", "x-aft-client": "web" },
      body: JSON.stringify({ files }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.url) {
      return { error: data.reason || data.hint || data.message || data.error || `Publish failed (${res.status})` };
    }
    return {
      ok: true,
      url: data.url,
      slug: data.slug,
      deployId: data.deployId,
      editToken: data.editToken || null,
      claimUrl: data.claimUrl || null,
    };
  }

  /** Run a public GitHub repo → live URL (same as the Run page). */
  async function execDeployRepo(input, ctx) {
    const raw = String((input && input.url) || "").trim();
    if (!raw) return { error: "url is required (GitHub URL or owner/repo)." };
    const rootDir = input && input.root ? String(input.root).replace(/^\/+|\/+$/g, "") : "";
    const ok = await ctx.confirm({
      title: "Run this GitHub repo on aft.page?",
      message: `Aft will clone, build, and host ${raw}${rootDir ? ` (folder: ${rootDir})` : ""}.\n\nPublic repos only. This can take a few minutes for buildable apps.`,
      confirmLabel: "Run",
    });
    if (!ok) return { declined: true, message: "Run declined." };

    const res = await fetch(`${API}/v1/repo/deploy`, {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json", "x-aft-client": "web" },
      body: JSON.stringify({ url: raw, ...(rootDir ? { root: rootDir } : {}) }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { error: data.reason || data.message || data.error || `Run failed (${res.status})` };
    if (res.status === 202 && data.jobId) {
      return { ok: true, jobId: data.jobId, status: "building", url: data.url || null };
    }
    if (data.url) return { ok: true, status: "live", url: data.url, slug: data.slug || null, editToken: data.editToken || null };
    return { error: "Run returned an unexpected response." };
  }

  /** Tools registered on /drop/ (anonymous publish). */
  function dropTools(ctx) {
    return [
      {
        name: "publish_html",
        title: "Publish an HTML page",
        description:
          "Publish a single HTML document to a live https://*.aft.page URL. Pass the full HTML in `html` (optionally `preferred_slug`). Requires your confirmation in the page.",
        annotations: { consequentialHint: true },
        inputSchema: {
          type: "object",
          properties: {
            html: { type: "string", description: "Full HTML document to publish." },
            preferred_slug: {
              type: "string",
              description: "Optional preferred slug (lowercase letters, digits, hyphens). First hit wins; a collision gets a suffix.",
            },
          },
          required: ["html"],
        },
        execute: (input) => execPublishHtml(input, ctx),
      },
      {
        name: "publish_files",
        title: "Publish files",
        description:
          "Publish a set of files (e.g. a built site) to a live https://*.aft.page URL. Pass files as [{ path, content }]; include index.html. Requires your confirmation in the page.",
        annotations: { consequentialHint: true },
        inputSchema: {
          type: "object",
          properties: {
            files: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  path: { type: "string", description: "Relative path, e.g. index.html or assets/app.js" },
                  content: { type: "string", description: "UTF-8 file content" },
                },
                required: ["path", "content"],
              },
              description: "Built files to publish. Max 500. Never include src/, node_modules, .next/.",
            },
            preferred_slug: {
              type: "string",
              description: "Optional preferred slug (lowercase letters, digits, hyphens).",
            },
          },
          required: ["files"],
        },
        execute: (input) => execPublishFiles(input, ctx),
      },
    ];
  }

  /** Tool registered on /run/ (anonymous repo deploy). */
  function runTools(ctx) {
    return [
      {
        name: "deploy_repo",
        title: "Run a GitHub repo",
        description:
          "Clone a public GitHub repo, build it (Vite/Next/static), and host it at a live https://*.aft.page URL. Pass a GitHub URL or owner/repo, optionally a subfolder `root`. Requires your confirmation in the page.",
        annotations: { consequentialHint: true },
        inputSchema: {
          type: "object",
          properties: {
            url: { type: "string", description: "GitHub URL or owner/repo, e.g. https://github.com/mdn/beginner-html-site" },
            root: { type: "string", description: "Optional subfolder to run when the repo has multiple apps." },
          },
          required: ["url"],
        },
        execute: (input) => execDeployRepo(input, ctx),
      },
    ];
  }

  root.aftWebmcpDeploy = {
    API,
    slugFromHtml,
    dropTools,
    runTools,
    execPublishHtml,
    execPublishFiles,
    execDeployRepo,
  };
})(typeof window !== "undefined" ? window : globalThis);
