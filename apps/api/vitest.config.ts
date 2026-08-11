import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  cloudflareTest,
  readD1Migrations,
} from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(async () => {
  const migrations = await readD1Migrations(path.join(__dirname, "migrations"));

  return {
    plugins: [
      cloudflareTest({
        wrangler: { configPath: "./wrangler.jsonc" },
        miniflare: {
          bindings: {
            AUTH_SECRET: "test-auth-secret-for-vitest-only",
            OPS_EMAILS: "ops@example.com,vaibhavmule135@gmail.com",
            SMOKE_SECRET: "test-smoke-secret",
            CF_API_TOKEN: "test-cf-api-token",
            TEST_MIGRATIONS: migrations,
          },
          serviceBindings: {
            MCP: (request: Request) => {
              const path = new URL(request.url).pathname;
              if (path === "/flight") {
                return new Response(
                  JSON.stringify({
                    claimPage: { ok: true, status: 200 },
                    serve: {
                      ok: true,
                      html: "https://test--html.aft.page",
                      files: "https://test--files.aft.page",
                      priv: 302,
                    },
                    domains: { ok: true, total: 0, probed: 0, skipped: 0, failed: [], probes: [] },
                  }),
                  { status: 200, headers: { "content-type": "application/json" } },
                );
              }
              return new Response(JSON.stringify({ ok: true, service: "aft-page-mcp" }), {
                status: 200,
                headers: { "content-type": "application/json" },
              });
            },
            SALES: () =>
              new Response(JSON.stringify({ ok: true, service: "aft-page-sales" }), {
                status: 200,
                headers: { "content-type": "application/json" },
              }),
          },
        },
      }),
    ],
    test: {
      setupFiles: ["./test/apply-migrations.ts"],
    },
  };
});
