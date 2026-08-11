/** Public marketing + app shells to render-check. Board/craft HTML is out. */

export const ROOT = process.env.AFT_ROOT || "https://aft.page";
export const API = process.env.AFT_API || "https://api.aft.page";

/** @typedef {{ path: string, must?: string[], mustNot?: string[], mode?: "browser" | "fetch", base?: "www" | "api", minLen?: number }} PageCase */

/** @type {PageCase[]} */
export const PAGES = [
  // —— Marketing (sitemap + shells) ——
  { path: "/", must: ["aft.page", "shareable"] },
  { path: "/docs", must: ["aft.page"] },
  { path: "/docs.md", must: ["aft"], mode: "fetch" },
  { path: "/changelog", must: ["Changelog", "aft.page"] },
  { path: "/plugins", must: ["aft.page"] },
  { path: "/mcp", must: ["MCP", "aft.page"] },
  { path: "/mcp.md", must: ["MCP"], mode: "fetch" },
  { path: "/llms.txt", must: ["aft"], mode: "fetch" },
  { path: "/llms.html", must: ["aft"] },
  { path: "/drop/", must: ["Drop", "aft.page"] },
  { path: "/host-html/", must: ["aft.page"] },
  { path: "/share-html/", must: ["aft.page"] },
  { path: "/upload-html/", must: ["aft.page"] },
  { path: "/privacy/", must: ["Privacy", "aft.page"] },
  { path: "/terms/", must: ["Terms", "aft.page"] },
  { path: "/cookies/", must: ["Cookie", "aft.page"] },

  // —— With / vs ——
  { path: "/with/claude/", must: ["Claude", "aft.page"] },
  { path: "/with/cursor/", must: ["Cursor", "aft.page"] },
  { path: "/with/codex/", must: ["Codex", "aft.page"] },
  { path: "/with/chatgpt/", must: ["ChatGPT", "aft.page"] },
  { path: "/with/api/", must: ["aft.page"] },
  { path: "/with/openclaw/", must: ["aft.page"] },
  { path: "/with/replit/", must: ["aft.page"] },
  { path: "/with/vercel/", must: ["aft.page"] },
  { path: "/with/windsurf/", must: ["aft.page"] },
  { path: "/with/lovable/", must: ["aft.page"] },
  { path: "/with/kilo/", must: ["aft.page"] },
  { path: "/with/hermes/", must: ["aft.page"] },
  { path: "/with/aws/", must: ["aft.page"] },
  { path: "/vs/vercel/", must: ["Vercel", "aft.page"] },
  { path: "/vs/cloudflare-drop/", must: ["aft.page"] },
  { path: "/vs/github-pages/", must: ["aft.page"] },

  // —— App shells (logged-out still must render) ——
  { path: "/login/", must: ["aft.page"] },
  { path: "/claim/", must: ["Claim", "aft.page"] },
  { path: "/projects/", must: ["aft.page"] },
  { path: "/projects/new/", must: ["aft.page"] },
  { path: "/project/", must: ["aft.page"] },
  { path: "/preview/", must: ["aft.page"] },
  { path: "/crons/", must: ["aft.page"] },

  // —— API (no browser) ——
  { path: "/health", base: "api", mode: "fetch", must: ["ok"], minLen: 8 },
  {
    path: "/v1/changelog.md",
    base: "api",
    mode: "fetch",
    must: ["#"],
  },
];

export const MUST_NOT_GLOBAL = [
  "Error 1101",
  "Error 1000",
  "Attention Required! | Cloudflare",
  "This page isn’t working",
  "502 Bad Gateway",
  "Worker threw exception",
];
