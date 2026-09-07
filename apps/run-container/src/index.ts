/** Run container: HTTP accept → queue → AftRunAgent → Sandbox. */
import { getSandbox, proxyToSandbox, Sandbox as SandboxBase, type Sandbox } from "@cloudflare/sandbox";
import { AftRunAgent, runAftAgent } from "./agent";
import { DEFAULT_API, failJob } from "./job-api";
import { CONTAINER_PUBLISH_PORT, isSandboxId } from "./origin";
import type { Env, RunBody } from "./types";

export { Sandbox } from "@cloudflare/sandbox";
/** DinD container class — same Sandbox DO protocol, different image (wrangler). */
export class SandboxDind extends SandboxBase {}
export { AftRunAgent };

/**
 * Job-control endpoints (/v1/run, /v1/rebind) are only reachable from the API
 * Worker's service binding (run-container.internal). The public custom domain
 * and *.workers.dev hosts stay up for /health and the sandbox proxy only —
 * otherwise anyone could enqueue a Sandbox job or destroy a live tunnel.
 */
export function isInternalRunHost(host: string): boolean {
  return host.toLowerCase() === "run-container.internal";
}

/**
 * Serve a request straight into the container through its Durable Object.
 *
 * This is what replaces Quick Tunnels. A tunnel put a public, SLA-less
 * hostname underneath a permanent aft.page URL: when the container slept the
 * tunnel died, and recreating it produced a tunnel pointing at a port with no
 * process behind it (502). containerFetch has no hostname to go stale — the DO
 * is the durable handle and the container is addressed through it.
 */
async function serveFromSandbox(
  env: Env,
  request: Request,
  sandboxId: string,
  port: number,
): Promise<Response> {
  const sandbox = getSandbox(env.Sandbox, sandboxId, {
    normalizeId: true,
    sleepAfter: "30m",
    transport: "rpc",
  });
  const target = request.headers.get("x-aft-original-url") || request.url;
  const forwarded = new Request(target, {
    method: request.method,
    headers: stripControlHeaders(request.headers),
    body:
      request.method === "GET" || request.method === "HEAD" ? undefined : request.body,
    redirect: "manual",
    // @ts-expect-error duplex is required for streaming bodies in Workers
    duplex: "half",
  });
  return sandbox.containerFetch(forwarded, port);
}

/** Our own routing headers must not reach the tenant's app. */
function stripControlHeaders(incoming: Headers): Headers {
  const headers = new Headers(incoming);
  headers.delete("x-aft-sandbox");
  headers.delete("x-aft-port");
  headers.delete("x-aft-original-url");
  return headers;
}

async function rebindTunnel(
  env: Env,
  sandboxId: string,
  port: number,
): Promise<string | null> {
  const sandbox = getSandbox(env.Sandbox, sandboxId, {
    normalizeId: true,
    sleepAfter: "30m",
    transport: "rpc",
  });
  await sandbox.tunnels.destroy(port);
  const tunnel = await sandbox.tunnels.get(port);
  return tunnel.url || null;
}

export default {
  async fetch(
    request: Request,
    env: Env,
    _ctx: ExecutionContext,
  ): Promise<Response> {
    const proxied = await proxyToSandbox(request, env);
    if (proxied) return proxied;

    const url = new URL(request.url);
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "access-control-allow-origin": "*",
          "access-control-allow-methods": "POST, OPTIONS",
          "access-control-allow-headers": "content-type, authorization",
        },
      });
    }

    if (url.pathname === "/health") {
      return Response.json({ ok: true, service: "run-container" });
    }

    const internalOnly =
      url.pathname === "/v1/rebind" ||
      url.pathname === "/v1/serve" ||
      (url.pathname === "/v1/run" && request.method === "POST");
    if (internalOnly && !isInternalRunHost(url.hostname)) {
      return Response.json({ error: "not_found" }, { status: 404 });
    }

    if (url.pathname === "/v1/serve") {
      const sandboxId = (request.headers.get("x-aft-sandbox") || "").trim();
      const port = Number.parseInt(request.headers.get("x-aft-port") || "", 10);
      if (!isSandboxId(sandboxId)) {
        return Response.json({ error: "invalid_sandbox" }, { status: 400 });
      }
      try {
        return await serveFromSandbox(
          env,
          request,
          sandboxId,
          Number.isFinite(port) && port > 0 ? port : CONTAINER_PUBLISH_PORT,
        );
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        console.warn(
          JSON.stringify({ level: "warn", where: "serve_sandbox", sandboxId, message }),
        );
        // 530 keeps the API Worker's existing dead-origin handling working.
        return new Response("container unreachable", { status: 530 });
      }
    }

    if (url.pathname === "/v1/rebind" && request.method === "POST") {
      let body: { sandbox_id?: unknown; port?: unknown } = {};
      try {
        body = (await request.json()) as typeof body;
      } catch {
        return Response.json({ error: "invalid_json" }, { status: 400 });
      }
      const sandboxId = typeof body.sandbox_id === "string" ? body.sandbox_id.trim() : "";
      const port =
        typeof body.port === "number" && body.port > 0
          ? body.port
          : CONTAINER_PUBLISH_PORT;
      if (!isSandboxId(sandboxId)) {
        return Response.json({ error: "invalid_sandbox" }, { status: 400 });
      }
      try {
        const upstream = await rebindTunnel(env, sandboxId, port);
        if (!upstream) {
          return Response.json({ error: "no_origin" }, { status: 503 });
        }
        return Response.json({ ok: true, upstream });
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        console.error("rebind", message);
        return Response.json({ error: "rebind_failed" }, { status: 503 });
      }
    }

    if (url.pathname !== "/v1/run" || request.method !== "POST") {
      return Response.json({ error: "not_found" }, { status: 404 });
    }

    let body: RunBody = {};
    try {
      body = (await request.json()) as RunBody;
    } catch {
      return Response.json({ error: "invalid_json" }, { status: 400 });
    }

    if (
      !body.job_id?.trim() ||
      !body.job_token?.trim() ||
      !body.owner?.trim() ||
      !body.repo?.trim() ||
      !body.slug?.trim()
    ) {
      return Response.json({ error: "missing_fields" }, { status: 400 });
    }

    const api = (body.aft_api || env.AFT_API || DEFAULT_API).replace(/\/$/, "");
    if (!env.RUN_JOBS) {
      await failJob(env, api, body.job_id.trim(), body.job_token.trim(), "Run queue is not configured.");
      return Response.json({ error: "queue_unavailable" }, { status: 503 });
    }
    await env.RUN_JOBS.send(body);
    return Response.json({ ok: true, status: "accepted" }, { status: 202 });
  },

  async queue(batch: MessageBatch<RunBody>, env: Env): Promise<void> {
    for (const msg of batch.messages) {
      try {
        await runAftAgent(env, msg.body);
        msg.ack();
      } catch (e) {
        console.error("queue runAftAgent", e);
        msg.retry();
      }
    }
  },
};
