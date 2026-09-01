/**
 * aft.page remote MCP — thin deploy adapter (docs/ADR-MCP-THIN.md).
 * Stateless Worker via createMcpHandler; calls aft-page-api over a service binding.
 */
import { McpServer } from "@modelcontextprotocol/server";
import { createMcpHandler } from "agents/mcp/server";
import { z } from "zod";
import {
  deployFiles,
  deployRepo,
  filesFromDeployInput,
  health,
  listDeploys,
  rollbackSite,
  type ApiTransport,
} from "./client";
import { runPublicFlight } from "./flight";

const slugSchema = z
  .string()
  .regex(/^[a-z0-9](?:[a-z0-9-]{0,46}[a-z0-9])?$/)
  .describe("Site slug from aft.json or .aft/state.json");

const editTokenSchema = z
  .string()
  .min(1)
  .describe("From first deploy / .aft/state.json. Required to update or rollback the same URL.");

/** Anon quick-view self-destruct, e.g. "1h", "24h", "90s", "7d". */
const expiresSchema = z
  .string()
  .regex(/^\d+(s|m|h|d)?$/)
  .describe('Optional quick-view expiry, e.g. "1h", "24h", "90s", "7d". Anonymous (unclaimed) deploys only — the link 404s after this.');

/** JSON-RPC method + tool name from an MCP POST body. */
export function parseMcpRpcMeta(body: unknown): { method: string; tool: string } {
  if (!body || typeof body !== "object") return { method: "", tool: "" };
  const o = body as { method?: unknown; params?: { name?: unknown } };
  const method = typeof o.method === "string" ? o.method : "";
  const tool = typeof o.params?.name === "string" ? o.params.name : "";
  return { method, tool };
}

function writeMcpMetric(
  env: Env,
  meta: { method: string; tool: string; status: string; ms: number; httpStatus: number },
): void {
  if (!env.METRICS) return;
  try {
    env.METRICS.writeDataPoint({
      indexes: ["mcp"],
      blobs: [meta.method || "unknown", meta.status, meta.tool, "", "", ""],
      doubles: [meta.ms, 0, 0, meta.httpStatus],
    });
  } catch {
    /* never fail the request */
  }
}

function apiTransport(env: Env): ApiTransport {
  const apiBase = (env.AFT_API_BASE || "https://api.aft.page").replace(/\/$/, "");
  return {
    apiBase,
    fetch: (input, init) => env.API.fetch(input, init),
  };
}

/** Strip UI chrome accidentally scraped after </html>. */
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

function formatDeploy(result: {
  url: string;
  editToken: string;
  slug: string;
  deployId: string;
  files: number;
  claimUrl?: string;
  notice?: string;
  expiresAt?: string;
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
  if (result.expiresAt) {
    lines.push(`Expires: ${result.expiresAt} — quick-view link, 404s after this.`);
  }
  if (result.notice) lines.push(result.notice);
  return lines.join("\n");
}

function formatRepoDeploy(result: {
  url: string;
  slug: string;
  jobId: string;
  owner: string;
  repo: string;
  kind?: string;
  branch?: string;
  editToken?: string;
  claimUrl?: string;
}): string {
  const lines = [
    `Live: ${result.url}`,
    `Repo: ${result.owner}/${result.repo}`,
    `slug: ${result.slug}`,
    `job: ${result.jobId}`,
  ];
  if (result.kind) lines.push(`kind: ${result.kind}`);
  if (result.branch) lines.push(`branch: ${result.branch}`);
  if (result.editToken) {
    const state = JSON.stringify({ slug: result.slug, editToken: result.editToken });
    lines.push(`editToken: ${result.editToken}`);
    lines.push(`Persist: write .aft/state.json ${state} and gitignore .aft/`);
  }
  lines.push(`Claim: ${result.claimUrl || result.url}`);
  lines.push("Secrets after claim: aft env set NAME=value (syncs to the site Worker).");
  return lines.join("\n");
}

function createServer(api: ApiTransport) {
  const server = new McpServer({
    name: "aft-page",
    version: "0.6.0",
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
              path: z.string().min(1).describe("Relative path, e.g. index.html"),
              content: z.string().describe("UTF-8 text (or base64 if encoding=base64)"),
              encoding: z.enum(["utf8", "base64"]).optional(),
            }),
          )
          .min(1)
          .max(500)
          .optional(),
        preferred_slug: slugSchema.optional().describe("aft.json slug. Required with edit_token."),
        edit_token: editTokenSchema.optional(),
        expires: expiresSchema.optional(),
      },
    },
    async ({ html, files, preferred_slug, edit_token, expires }) => {
      try {
        const upload = filesFromDeployInput({ html, files }).map((f) =>
          /\.html?$/i.test(f.path)
            ? { ...f, content: sanitizeHtmlDocument(f.content), encoding: "utf8" as const }
            : f,
        );
        const result = await deployFiles(upload, api, preferred_slug, edit_token, expires);
        return {
          content: [{ type: "text" as const, text: formatDeploy(result) }],
          structuredContent: result,
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(
          JSON.stringify({ level: "error", where: "mcp_tool", tool: "deploy", message }),
        );
        return {
          isError: true,
          content: [{ type: "text" as const, text: `Deploy failed: ${message}` }],
        };
      }
    },
  );

  server.registerTool(
    "deploy_repo",
    {
      title: "Deploy a public GitHub repo",
      description:
        "Same engine as aft.page/run: public GitHub URL → detect → build → live URL. " +
        "Static is instant; Vite and Next.js build in the background (polls until live or failed). " +
        "Private repos are refused. For a local project dir, use hosted CLI aft deploy instead.",
      inputSchema: {
        url: z
          .string()
          .min(3)
          .describe("GitHub URL or owner/repo, e.g. https://github.com/mdn/beginner-html-site"),
      },
    },
    async ({ url }) => {
      try {
        const result = await deployRepo(api, url);
        return {
          content: [{ type: "text" as const, text: formatRepoDeploy(result) }],
          structuredContent: result,
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(
          JSON.stringify({ level: "error", where: "mcp_tool", tool: "deploy_repo", message }),
        );
        return {
          isError: true,
          content: [{ type: "text" as const, text: `deploy_repo failed: ${message}` }],
        };
      }
    },
  );

  server.registerTool(
    "aft_deploys",
    {
      title: "List aft.page deploy history",
      description:
        "List rollback-able deploys for a slug. Needs edit_token from .aft/state.json " +
        "(or the first deploy). Same history the project UI shows after claim.",
      inputSchema: {
        slug: slugSchema,
        edit_token: editTokenSchema,
      },
    },
    async ({ slug, edit_token }) => {
      try {
        const result = await listDeploys(api, slug, edit_token);
        const lines = [
          `slug: ${result.slug}`,
          `live: ${result.currentDeployId}`,
          ...result.deploys.map(
            (d) =>
              `${d.id}  ${d.createdAt}  ${d.source}  files=${d.fileCount}` +
              (d.previewUrl ? `  ${d.previewUrl}` : "") +
              (d.id === result.currentDeployId ? "  ← live" : ""),
          ),
        ];
        return {
          content: [{ type: "text" as const, text: lines.join("\n") }],
          structuredContent: result,
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(
          JSON.stringify({ level: "error", where: "mcp_tool", tool: "aft_deploys", message }),
        );
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
        "Needs edit_token from .aft/state.json. Claim not required.",
      inputSchema: {
        slug: slugSchema,
        edit_token: editTokenSchema,
        deploy_id: z.string().min(1).describe("Prior deployId from aft_deploys"),
      },
    },
    async ({ slug, edit_token, deploy_id }) => {
      try {
        const result = await rollbackSite(api, slug, edit_token, deploy_id);
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
        console.error(
          JSON.stringify({ level: "error", where: "mcp_tool", tool: "aft_rollback", message }),
        );
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
        const h = await health(api);
        return {
          content: [
            {
              type: "text" as const,
              text: `ok=${h.ok} api=${api.apiBase} via=service-binding`,
            },
          ],
          structuredContent: { ...h, apiBase: api.apiBase, via: "service-binding" },
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(
          JSON.stringify({ level: "error", where: "mcp_tool", tool: "aft_health", message }),
        );
        return {
          isError: true,
          content: [{ type: "text" as const, text: message }],
        };
      }
    },
  );

  return server;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/" || url.pathname === "") {
      return Response.redirect("https://aft.page/mcp", 302);
    }
    if (url.pathname === "/health") {
      return Response.json({ ok: true, service: "aft-page-mcp" });
    }
    if (url.pathname === "/flight" && request.method === "POST") {
      if (!env.API) {
        return Response.json({ ok: false, error: "api_binding_missing" }, { status: 503 });
      }
      const auth = request.headers.get("authorization") || "";
      if (!auth.startsWith("Bearer ")) {
        return Response.json({ error: "unauthorized" }, { status: 401 });
      }
      const list = await env.API.fetch(
        new Request("https://ops.aft.page/api/smoke/domains", {
          headers: { authorization: auth },
          signal: AbortSignal.timeout(10_000),
        }),
      );
      if (list.status === 401) {
        return Response.json({ error: "unauthorized" }, { status: 401 });
      }
      let rows: { hostname: string; status: string; sslStatus: string | null }[] = [];
      if (list.ok) {
        const body = (await list.json()) as { domains?: typeof rows };
        rows = body.domains || [];
      }
      const flight = await runPublicFlight(rows);
      return Response.json(flight);
    }

    if (!env.API) {
      return Response.json({ ok: false, error: "api_binding_missing" }, { status: 503 });
    }
    const api = apiTransport(env);
    const started = Date.now();
    let method = "";
    let tool = "";
    try {
      const ct = request.headers.get("content-type") || "";
      if (ct.includes("json")) {
        const meta = parseMcpRpcMeta(await request.clone().json());
        method = meta.method;
        tool = meta.tool;
      }
    } catch {
      /* non-JSON body */
    }

    const res = await createMcpHandler(() => createServer(api), {
      route: "/mcp",
      allowedHostnames: ["mcp.aft.page", "aft-page-mcp.vaibhavmule135.workers.dev", "localhost"],
    })(request, env, ctx);

    const ms = Date.now() - started;
    let status = res.status >= 400 ? "error" : "ok";
    try {
      const ct = res.headers.get("content-type") || "";
      if (ct.includes("json")) {
        const body = (await res.clone().json()) as {
          error?: unknown;
          isError?: boolean;
          result?: { isError?: boolean };
        };
        if (body?.error || body?.isError || body?.result?.isError) status = "error";
      }
    } catch {
      /* streamed / non-JSON */
    }
    console.log(
      JSON.stringify({
        level: status === "error" ? "error" : "info",
        where: "mcp",
        method,
        tool,
        httpStatus: res.status,
        ms,
        status,
      }),
    );
    writeMcpMetric(env, { method, tool, status, ms, httpStatus: res.status });
    return res;
  },
} satisfies ExportedHandler<Env>;
