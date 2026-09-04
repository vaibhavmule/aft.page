/**
 * aftWebmcpTools — shared read-only WebMCP tool definitions for aft.page.
 *
 * These tools are registered on document.modelContext (via www/webmcp.js) when a
 * WebMCP-capable client visits. They expose only what the public site already
 * exposes: docs, platform status, open protocols, changelog, and public site
 * info. Every execute() returns a JSON-safe value (the spec serializes the
 * result), and every network call targets the same public endpoints the
 * marketing site already uses.
 *
 * Pure module (no DOM at import time) so it is unit-testable from apps/api.
 */
(function (root) {
  "use strict";

  const API = root.AFT_WEBMCP_API || "https://api.aft.page";

  /** Fetch JSON with a timeout; non-OK → structured { error } so agents see it. */
  async function fetchJson(url, opts) {
    const init = opts || {};
    const timeoutMs = init.timeoutMs || 8000;
    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
    try {
      const res = await fetch(url, {
        headers: { accept: "application/json" },
        credentials: init.credentials || "omit",
        signal: controller ? controller.signal : undefined,
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        const msg =
          (body && (body.error || body.hint || body.reason)) ||
          `Request failed (${res.status})`;
        return { error: msg, status: res.status };
      }
      return body || {};
    } catch (err) {
      return { error: err && err.name === "AbortError" ? "Request timed out" : "Network error" };
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  /* ------------------------------------------------------------------ *
   * Local curated knowledge maps (no network; updated with the docs).    *
   * ------------------------------------------------------------------ */

  const DOCS = {
    deploy: {
      title: "Deploy an app",
      href: "https://aft.page/docs/",
      summary: "HTML or a built folder → a live https://{slug}.aft.page URL.",
    },
    cli: {
      title: "CLI",
      href: "https://aft.page/docs/cli/",
      summary: "curl -fsSL https://aft.page/install | sh, then `aft deploy`.",
    },
    claim: {
      title: "Claim & share",
      href: "https://aft.page/docs/claim/",
      summary: "Add an email/Google owner; then private, invites, rollback.",
    },
    env: {
      title: "Secrets & environment",
      href: "https://aft.page/docs/env/",
      summary: "Per-site secret vault; approved via aft.json capabilities.",
    },
    domains: {
      title: "Custom domains",
      href: "https://aft.page/docs/domains/",
      summary: "Point your own domain at a claimed site.",
    },
    frameworks: {
      title: "Frameworks",
      href: "https://aft.page/docs/frameworks/",
      summary: "Plain HTML, Vite/React dist/, Next export out/, Next SSR.",
    },
    mcp: {
      title: "MCP for agents",
      href: "https://aft.page/mcp.md",
      summary: "Remote MCP server at https://mcp.aft.page/mcp (deploy tools).",
    },
  };

  const PROTOCOLS = [
    {
      name: "MCP",
      href: "https://aft.page/mcp.md",
      summary: "Thin remote server https://mcp.aft.page/mcp — deploy, deploy_repo, rollback.",
    },
    {
      name: "Skills",
      href: "https://aft.page/plugins.md",
      summary: "agentskills.io skill — deploy-to-aft teaches coding agents.",
    },
    {
      name: "Plugins",
      href: "https://aft.page/plugins.md",
      summary: "npx plugins add vaibhavmule/aft.page — agent plugin wrapping MCP.",
    },
    {
      name: "Unix / libaft",
      href: "https://aft.page/plugins.md",
      summary: "Small programs: aft CLI, curl, and libaft for embedding deploy.",
    },
  ];

  /* ------------------------------------------------------------------ *
   * Tool execute implementations.                                       *
   * ------------------------------------------------------------------ */

  /** Look up product docs by topic. */
  async function execDocs(input) {
    const topic = String((input && input.topic) || "");
    if (DOCS[topic]) {
      const d = DOCS[topic];
      return { topic, title: d.title, href: d.href, summary: d.summary };
    }
    return {
      topic: topic || "all",
      items: Object.keys(DOCS).map((k) => {
        const d = DOCS[k];
        return { topic: k, title: d.title, href: d.href, summary: d.summary };
      }),
    };
  }

  /** Live platform status (health endpoint the site already uses). */
  async function execStatus() {
    const result = await fetchJson(`${API}/health`);
    return { api: API, ok: result.ok === true, health: result };
  }

  /** Index of the open protocols aft extends through. */
  async function execOpenProtocols() {
    return { items: PROTOCOLS };
  }

  /** What shipped, by day. */
  async function execChangelog() {
    const result = await fetchJson(`${API}/v1/changelog`);
    if (result.error) return result;
    const entries = Array.isArray(result) ? result : result.entries || [];
    return {
      count: entries.length,
      entries: entries.slice(0, 20).map((e) => ({
        date: e.date || e.day || null,
        title: e.title || e.summary || null,
        href: e.href || null,
      })),
    };
  }

  /** Public info for an aft site (only public fields; matches the live badge). */
  async function execSiteInfo(input) {
    const slug = String((input && input.slug) || "").toLowerCase().trim();
    if (!/^[a-z0-9](?:[a-z0-9-]{0,46}[a-z0-9])?$/.test(slug)) {
      return { error: "Invalid slug. Use lowercase letters, digits, hyphens." };
    }
    const result = await fetchJson(`${API}/v1/sites/${encodeURIComponent(slug)}`);
    if (result.error) {
      return { slug, error: result.error };
    }
    return {
      slug,
      url: result.url || null,
      deployId: result.deployId || null,
      expiresAt: result.expiresAt || null,
      owned: Boolean(result.owned),
      runtime: result.runtime || null,
    };
  }

  /* ------------------------------------------------------------------ *
   * Tool registry (exported for registration + tests).                  *
   * ------------------------------------------------------------------ */

  /** The public/demo tool set. All read-only. */
  function publicTools() {
    return [
      {
        name: "get_aft_page_docs",
        title: "Look up aft.page product docs",
        description:
          "Returns aft.page documentation for a topic: how to deploy, claim, manage secrets, custom domains, and frameworks. Topics: deploy, cli, claim, env, domains, frameworks, mcp.",
        inputSchema: {
          type: "object",
          properties: {
            topic: {
              type: "string",
              enum: ["deploy", "cli", "claim", "env", "domains", "frameworks", "mcp"],
              description: "Which docs topic to return. Omit to list all.",
            },
          },
        },
        execute: execDocs,
      },
      {
        name: "get_aft_page_status",
        title: "aft.page platform status",
        description:
          "Reports whether the aft.page deploy API is healthy and reachable, and the API base URL.",
        inputSchema: { type: "object", properties: {} },
        execute: execStatus,
      },
      {
        name: "get_aft_page_open_protocols",
        title: "How agents reach aft.page",
        description:
          "Lists the open protocols aft.page extends through: MCP, Skills, Plugins, and Unix/libaft, each with a URL.",
        inputSchema: { type: "object", properties: {} },
        execute: execOpenProtocols,
      },
      {
        name: "get_aft_page_changelog",
        title: "aft.page changelog",
        description:
          "Returns recent aft.page product changes (what shipped, by day).",
        inputSchema: { type: "object", properties: {} },
        execute: execChangelog,
      },
      {
        name: "get_aft_site_info",
        title: "Public info for an aft.page site",
        description:
          "Returns public metadata for a hosted aft.page site by slug: live URL, current deploy id, expiry, whether it is claimed, and runtime. Only public fields.",
        inputSchema: {
          type: "object",
          properties: {
            slug: {
              type: "string",
              description: "Site slug, e.g. hello (lowercase letters, digits, hyphens).",
            },
          },
          required: ["slug"],
        },
        execute: execSiteInfo,
      },
    ];
  }

  root.aftWebmcpTools = {
    API,
    fetchJson,
    publicTools,
    docs: DOCS,
    protocols: PROTOCOLS,
  };
})(typeof window !== "undefined" ? window : globalThis);
