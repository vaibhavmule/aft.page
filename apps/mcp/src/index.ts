#!/usr/bin/env node
/**
 * aft.page MCP server — stdio transport for Cursor, Claude Desktop, etc.
 *
 * Tools call the public Worker API (https://api.aft.page). No account required
 * today; each deploy gets a unique *.aft.page URL.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { DEFAULT_API, deployFiles, deployHtml, health } from "./client.js";

const apiBase = process.env.AFT_API_BASE?.replace(/\/$/, "") || DEFAULT_API;

const server = new McpServer({
  name: "aft-page",
  version: "0.1.0",
});

server.registerTool(
  "deploy_html",
  {
    title: "Deploy HTML to aft.page",
    description:
      "Publish a single HTML document (inline CSS/JS fine) to a live HTTPS URL on *.aft.page. " +
      "No account required. If preferred_slug is taken, aft.page auto-suffixes (e.g. about-me-mist). " +
      "Use this when the user asks to deploy, publish, host, or share a page/site they just built.",
    inputSchema: {
      html: z
        .string()
        .min(1)
        .describe("Full HTML document to publish (prefer <!DOCTYPE html>…</html>)"),
      preferred_slug: z
        .string()
        .regex(/^[a-z0-9](?:[a-z0-9-]{0,46}[a-z0-9])?$/)
        .optional()
        .describe(
          "Optional URL slug hint from the page title (e.g. about-me). Never overwrites an existing site.",
        ),
    },
  },
  async ({ html, preferred_slug }) => {
    try {
      const result = await deployHtml(html, {
        slug: preferred_slug,
        apiBase,
      });
      return {
        content: [
          {
            type: "text" as const,
            text: [
              `Live: ${result.url}`,
              `slug: ${result.slug}`,
              `deploy: ${result.deployId}`,
              `files: ${result.files}`,
              `storage: ${result.storage}`,
            ].join("\n"),
          },
        ],
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
  "deploy_files",
  {
    title: "Deploy static files to aft.page",
    description:
      "Publish multiple static files (HTML/CSS/JS/assets) as one site on *.aft.page. " +
      "Use for Vite/React SPA build output (dist/) or multi-file pages. Paths are relative " +
      "(e.g. index.html, assets/app.js). Limits: 50 files, 2MB each, 5MB total.",
    inputSchema: {
      files: z
        .array(
          z.object({
            path: z
              .string()
              .min(1)
              .describe("Relative path inside the site, e.g. index.html or assets/app.js"),
            content: z.string().describe("File contents as UTF-8 text (or base64 if encoding=base64)"),
            encoding: z
              .enum(["utf8", "base64"])
              .optional()
              .describe("Defaults to utf8"),
          }),
        )
        .min(1)
        .max(50),
      preferred_slug: z
        .string()
        .regex(/^[a-z0-9](?:[a-z0-9-]{0,46}[a-z0-9])?$/)
        .optional()
        .describe("Optional URL slug hint"),
    },
  },
  async ({ files, preferred_slug }) => {
    try {
      const result = await deployFiles(files, {
        slug: preferred_slug,
        apiBase,
      });
      return {
        content: [
          {
            type: "text" as const,
            text: [
              `Live: ${result.url}`,
              `slug: ${result.slug}`,
              `deploy: ${result.deployId}`,
              `files: ${result.files}`,
              `storage: ${result.storage}`,
            ].join("\n"),
          },
        ],
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
  "aft_health",
  {
    title: "Check aft.page API",
    description: "Ping the aft.page deploy API and report storage mode (r2+kv).",
    inputSchema: {},
  },
  async () => {
    try {
      const h = await health(apiBase);
      return {
        content: [
          {
            type: "text" as const,
            text: `ok=${h.ok} storage=${h.storage ?? "unknown"} api=${apiBase}`,
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
      "Guide for publishing small software the user just built to a live *.aft.page URL.",
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
            "- Prefer deploy_html for a single HTML document with inline CSS/JS.",
            "- Prefer deploy_files for multiple files or a static SPA (include index.html).",
            "- Pass preferred_slug from <title> or a short project name when sensible.",
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
