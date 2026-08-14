#!/usr/bin/env node
/**
 * aft.page MCP server — stdio transport for Cursor, Claude Desktop, etc.
 *
 * Tools call the public Worker API (https://api.aft.page). First deploy mints a
 * slug + editToken; later deploys PATCH the same URL when edit_token is passed.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  DEFAULT_API,
  deployFiles,
  filesFromDeployInput,
  health,
  listDeploys,
  rollbackSite,
} from "./client.js";

/** Strip UI chrome accidentally scraped after </html> (extension "Deploy"). */
function sanitizeHtmlDocument(text: string): string {
  let t = String(text ?? "").trim();
  const close = t.search(/<\/html>\s*/i);
  if (close !== -1) {
    t = t.slice(0, close + "</html>".length);
  }
  t = t.replace(
    /\s*(Deploy(?:\s+to\s+aft\.page)?|Live ✓|Publishing…|Failed|Empty|Not HTML)\s*$/i,
    "",
  );
  return t.trim();
}

const slugSchema = z
  .string()
  .regex(/^[a-z0-9](?:[a-z0-9-]{0,46}[a-z0-9])?$/);

const editTokenSchema = z.string().min(1);

const apiBase = process.env.AFT_API_BASE?.replace(/\/$/, "") || DEFAULT_API;

function formatDeploy(result: {
  url: string;
  editToken: string;
  slug: string;
  deployId: string;
  files: number;
  claimUrl?: string;
  notice?: string;
}): string {
  const state = JSON.stringify({ slug: result.slug, editToken: result.editToken });
  const lines = [
    `Live: ${result.url}`,
    `Claim (give this to the human — email or Google): ${result.claimUrl || result.url}`,
    `editToken: ${result.editToken} (keep secret — redeploy + claim + rollback)`,
    `slug: ${result.slug}`,
    `deploy: ${result.deployId}`,
    `files: ${result.files}`,
    `Persist: write .aft/state.json ${state} and gitignore .aft/`,
    "Next deploy: pass this slug + edit_token → same URL, this deployId becomes rollback history.",
    "Claim keeps this slug. Do not POST again without edit_token.",
  ];
  if (result.notice) lines.push(result.notice);
  return lines.join("\n");
}

const server = new McpServer({
  name: "aft-page",
  version: "0.4.0",
});

server.registerTool(
  "deploy",
  {
    title: "Deploy to aft.page",
    description:
      "Publish to a live URL. Pass html (one page) OR files (built site). " +
      "Plain HTML → html. Vite/React → npm run build, then files from dist/. " +
      "Next static export → files from out/. Always include index.html. " +
      "Never upload src/, node_modules, or .next/. " +
      "First hit: preferred_slug from aft.json (include aft.json in files). " +
      "Later: same slug + edit_token from .aft/state.json. " +
      "Limits: 500 files, 25MB each, 100MB total.",
    inputSchema: {
      html: z
        .string()
        .min(1)
        .optional()
        .describe("One HTML document. Ignored if files is set."),
      files: z
        .array(
          z.object({
            path: z
              .string()
              .min(1)
              .describe("Relative path, e.g. index.html or assets/app.js"),
            content: z.string().describe("UTF-8 text (or base64 if encoding=base64)"),
            encoding: z.enum(["utf8", "base64"]).optional(),
          }),
        )
        .min(1)
        .max(500)
        .optional(),
      preferred_slug: slugSchema
        .optional()
        .describe("aft.json slug. Required with edit_token."),
      edit_token: editTokenSchema
        .optional()
        .describe("From first deploy / .aft/state.json. Updates the same URL."),
    },
  },
  async ({ html, files, preferred_slug, edit_token }) => {
    try {
      const upload = filesFromDeployInput({ html, files }).map((f) =>
        /\.html?$/i.test(f.path)
          ? { ...f, content: sanitizeHtmlDocument(f.content), encoding: "utf8" as const }
          : f,
      );
      const result = await deployFiles(upload, {
        slug: preferred_slug,
        editToken: edit_token,
        apiBase,
      });
      return {
        content: [{ type: "text" as const, text: formatDeploy(result) }],
        structuredContent: result,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        isError: true,
        content: [{ type: "text" as const, text: `Deploy failed: ${message}` }],
      };
    }
  },
);

server.registerTool(
  "aft_deploys",
  {
    title: "List aft.page deploy history",
    description:
      "List rollback-able deploys for a slug. Needs edit_token from .aft/state.json. " +
      "Same history the project UI shows after claim.",
    inputSchema: {
      slug: slugSchema.describe("Locked site slug"),
      edit_token: editTokenSchema.describe("From .aft/state.json"),
    },
  },
  async ({ slug, edit_token }) => {
    try {
      const result = await listDeploys(slug, edit_token, apiBase);
      const lines = [
        `slug: ${result.slug}`,
        `live: ${result.currentDeployId}`,
        ...result.deploys.map(
          (d) =>
            `${d.id}  ${d.createdAt}  ${d.source}  files=${d.fileCount}` +
            (d.id === result.currentDeployId ? "  ← live" : ""),
        ),
      ];
      return {
        content: [{ type: "text" as const, text: lines.join("\n") }],
        structuredContent: result,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        isError: true,
        content: [{ type: "text" as const, text: `List deploys failed: ${message}` }],
      };
    }
  },
);

server.registerTool(
  "aft_rollback",
  {
    title: "Rollback aft.page site",
    description:
      "Point the live slug at a prior deployId from aft_deploys. Same URL. " +
      "Needs edit_token. Claim not required.",
    inputSchema: {
      slug: slugSchema.describe("Locked site slug"),
      edit_token: editTokenSchema.describe("From .aft/state.json"),
      deploy_id: z.string().min(1).describe("Prior deployId from aft_deploys"),
    },
  },
  async ({ slug, edit_token, deploy_id }) => {
    try {
      const result = await rollbackSite(slug, edit_token, deploy_id, apiBase);
      return {
        content: [
          {
            type: "text" as const,
            text: `Rolled back ${result.slug} → ${result.deployId}\nLive: ${result.url}`,
          },
        ],
        structuredContent: result,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        isError: true,
        content: [{ type: "text" as const, text: `Rollback failed: ${message}` }],
      };
    }
  },
);

server.registerTool(
  "aft_health",
  {
    title: "Check aft.page API",
    description: "Ping the aft.page deploy API.",
    inputSchema: {},
  },
  async () => {
    try {
      const h = await health(apiBase);
      return {
        content: [
          {
            type: "text" as const,
            text: `ok=${h.ok} api=${apiBase}`,
          },
        ],
        structuredContent: { ...h, apiBase },
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        isError: true,
        content: [{ type: "text" as const, text: message }],
      };
    }
  },
);

server.registerPrompt(
  "deploy_to_aft",
  {
    title: "Deploy to aft.page",
    description:
      "Guide for publishing small software the user just built to a live URL.",
    argsSchema: {
      html_or_files: z
        .string()
        .optional()
        .describe("Brief description of what to deploy (single HTML vs multi-file)"),
    },
  },
  async ({ html_or_files }) => ({
    messages: [
      {
        role: "user" as const,
        content: {
          type: "text" as const,
          text: [
            "Deploy this small software to aft.page using the MCP tools.",
            "",
            "Rules:",
            "- Detect first: plain HTML vs JS app (Vite/React/Next).",
            "- If aft.json exists, obey slug/build/output.",
            "- If .aft/state.json exists, pass its slug + editToken — same URL, new history row.",
            "- Call deploy once: html for one page, or files for a built folder.",
            "- Vite/React/Vue → npm run build, then deploy files from dist/ only.",
            "- Next static export → npm run build, then deploy files from out/.",
            "- Never upload src/, node_modules, or .next/.",
            "- After first deploy, write .aft/state.json and gitignore .aft/.",
            "- Rollback: aft_deploys then aft_rollback. Claim does not change the slug.",
            "- Return the live HTTPS URL to the user — that is the deliverable.",
            "- Do not ask them to open Vercel, GitHub, or create an account.",
            html_or_files ? `\nContext: ${html_or_files}` : "",
          ].join("\n"),
        },
      },
    ],
  }),
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
