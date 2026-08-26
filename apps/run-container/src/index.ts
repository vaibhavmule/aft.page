/** Run container jobs: Sandbox clone → install → start → public URL → AFT complete. */
import { getSandbox, proxyToSandbox, type Sandbox } from "@cloudflare/sandbox";

export { Sandbox } from "@cloudflare/sandbox";

type Plan = {
  stack?: string;
  install?: string;
  start?: string;
  build?: string;
  port?: number;
};

type RunBody = {
  job_id?: string;
  job_token?: string;
  owner?: string;
  repo?: string;
  slug?: string;
  branch?: string;
  plan?: Plan | null;
  aft_api?: string;
};

type Env = {
  Sandbox: DurableObjectNamespace<Sandbox>;
  AFT_API?: string;
  /** Service binding to aft-page-api (required for Worker→Worker job patches). */
  AFT_API_SERVICE?: Fetcher;
  RUN_JOBS?: Queue<RunBody>;
};

/** Wall clock for one Run (install + boot + publish). */
const JOB_DEADLINE_MS = 12 * 60 * 1000;
const DEFAULT_API = "https://api.aft.page";

const scrub = (s: string): string =>
  s
    .replace(/opennextjs-cloudflare/gi, "next build")
    .replace(/@opennextjs\/\S+/gi, "next")
    .replace(/\bOpenNext\b/gi, "Next.js")
    .replace(/\bWrangler\b/g, "")
    .replace(/\bwrangler\b/g, "")
    .replace(/\bCloudflare\b/gi, "aft")
    .replace(/\bsandbox\b/gi, "runner")
    .replace(/trycloudflare\.com/gi, "aft.page")
    .replace(/ {2,}/g, " ")
    .trim();

async function apiFetch(
  env: Env,
  apiBase: string,
  path: string,
  init: RequestInit,
): Promise<Response> {
  if (env.AFT_API_SERVICE) {
    // Host must look like the API so routeRequest → handleApi (not unknown_host).
    return env.AFT_API_SERVICE.fetch(
      new Request(`https://api.aft.page${path}`, init),
    );
  }
  return fetch(`${apiBase}${path}`, init);
}

async function patchJob(
  env: Env,
  api: string,
  jobId: string,
  token: string,
  phase: string,
  line?: string,
  reason?: string,
) {
  const body: Record<string, string> = { phase };
  if (line) body.line = scrub(line).slice(-2000);
  if (reason) body.reason = scrub(reason).slice(0, 500);
  try {
    const res = await apiFetch(env, api, `/v1/jobs/${jobId}`, {
      method: "PATCH",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        "user-agent": "aft.page-run-container",
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error(`patchJob ${phase} ${res.status}: ${text.slice(0, 200)}`);
    } else {
      await res.body?.cancel().catch(() => null);
    }
  } catch (e) {
    console.error(`patchJob ${phase} failed`, e);
  }
}

async function failJob(
  env: Env,
  api: string,
  jobId: string,
  token: string,
  reason: string,
) {
  await patchJob(env, api, jobId, token, "failed", reason, reason);
}

async function completeJob(
  env: Env,
  api: string,
  jobId: string,
  token: string,
  upstream: string,
) {
  const res = await apiFetch(env, api, `/v1/jobs/${jobId}/complete`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      "user-agent": "aft.page-run-container",
    },
    body: JSON.stringify({ upstream }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`complete ${res.status}: ${text.slice(0, 200)}`);
  }
  await res.body?.cancel().catch(() => null);
}

function cmdOut(r: { stdout?: string; stderr?: string }): string {
  return `${r.stderr || ""}\n${r.stdout || ""}`.trim();
}

function isDockerPlan(plan: Plan): boolean {
  const s = `${plan.stack || ""} ${plan.start || ""} ${plan.build || ""}`.toLowerCase();
  return s.includes("docker");
}

async function runJob(env: Env, body: RunBody) {
  const started = Date.now();
  const jobId = body.job_id!.trim();
  const jobToken = body.job_token!.trim();
  const owner = body.owner!.trim();
  const repo = body.repo!.trim();
  const slug = body.slug!.trim().toLowerCase();
  const branch = body.branch?.trim() || "main";
  const plan = body.plan || {};
  const api = (body.aft_api || env.AFT_API || DEFAULT_API).replace(/\/$/, "");
  const port = plan.port && plan.port > 0 ? plan.port : 8080;

  const deadline = () => {
    if (Date.now() - started > JOB_DEADLINE_MS) {
      throw new Error("Build timed out (12 min).");
    }
  };

  if (isDockerPlan(plan)) {
    await failJob(
      env,
      api,
      jobId,
      jobToken,
      "Dockerfile apps are not supported in this runner yet. Use a Node or Python start command (npm start, flask, uvicorn).",
    );
    return;
  }

  // Fresh sandbox per job — avoids stale /workspace from prior runs.
  const sandboxId = `run-${jobId}`.replace(/[^a-z0-9-]/g, "-").slice(0, 60);
  const appDir = "app";
  const workdir = `/workspace/${appDir}`;
  const sandbox = getSandbox(env.Sandbox, sandboxId, {
    normalizeId: true,
    sleepAfter: "30m",
    transport: "rpc",
  });

  try {
    await patchJob(
      env,
      api,
      jobId,
      jobToken,
      "cloning",
      `Cloning ${owner}/${repo}@${branch}`,
    );
    deadline();
    await sandbox.gitCheckout(`https://github.com/${owner}/${repo}.git`, {
      branch,
      targetDir: appDir,
    });
    const ls = await sandbox.exec(`test -d ${workdir} && echo ok || ls -la /workspace`);
    if (!ls.success || !(ls.stdout || "").includes("ok")) {
      await failJob(
        env,
        api,
        jobId,
        jobToken,
        `Clone landed in an unexpected path: ${cmdOut(ls).slice(0, 300)}`,
      );
      return;
    }
    await patchJob(env, api, jobId, jobToken, "cloning", `Cloned ${owner}/${repo}@${branch}`);

    if (plan.install) {
      deadline();
      await patchJob(env, api, jobId, jobToken, "installing", plan.install);
      const inst = await sandbox.exec(`cd ${workdir} && ${plan.install}`);
      const out = cmdOut(inst);
      if (out) await patchJob(env, api, jobId, jobToken, "installing", out.slice(-1800));
      if (!inst.success) {
        await failJob(env, api, jobId, jobToken, `Install failed: ${out.slice(0, 400)}`);
        return;
      }
      await patchJob(env, api, jobId, jobToken, "installing", "install done");
    }

    const startCmd = plan.start;
    if (!startCmd) {
      await failJob(env, api, jobId, jobToken, "No start command in the build plan.");
      return;
    }

    deadline();
    await patchJob(env, api, jobId, jobToken, "building", `Starting ${plan.stack || "app"}`);
    const proc = await sandbox.startProcess(
      `cd ${workdir} && PORT=${port} HOST=0.0.0.0 ${startCmd}`,
      {
        cwd: workdir,
        env: {
          PORT: String(port),
          HOST: "0.0.0.0",
        },
      },
    );

    let ready = false;
    try {
      await proc.waitForPort(port, { mode: "tcp", timeout: 60_000 });
      ready = true;
    } catch {
      /* fall through to probe loop */
    }
    for (let i = 0; !ready && i < 20; i++) {
      deadline();
      await new Promise((r) => setTimeout(r, 1500));
      const probe = await sandbox.exec(
        `python3 -c "import socket;s=socket.socket();s.settimeout(1);s.connect(('127.0.0.1',${port}));print('ok')"`,
      );
      if (probe.success && (probe.stdout || "").includes("ok")) {
        ready = true;
        break;
      }
      if (i === 3 || i === 10) {
        try {
          const logs = await proc.getLogs();
          const blob = scrub(`${logs.stdout || ""}\n${logs.stderr || ""}`).slice(-1500);
          if (blob) await patchJob(env, api, jobId, jobToken, "building", blob);
        } catch {
          /* ignore */
        }
      }
    }
    if (!ready) {
      let hint = `App did not listen on port ${port} in time.`;
      try {
        const logs = await proc.getLogs();
        const blob = scrub(`${logs.stderr || ""}\n${logs.stdout || ""}`).slice(0, 400);
        if (blob) hint = `${hint} ${blob}`;
      } catch {
        /* ignore */
      }
      await failJob(env, api, jobId, jobToken, hint);
      return;
    }

    deadline();
    await patchJob(env, api, jobId, jobToken, "deploying", "Publishing");
    const tunnel = await sandbox.tunnels.get(port);
    const upstream = tunnel.url;
    if (!upstream) {
      await failJob(env, api, jobId, jobToken, "Could not get a public URL for the process.");
      return;
    }
    await completeJob(env, api, jobId, jobToken, upstream);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await failJob(env, api, jobId, jobToken, msg.slice(0, 500));
  }
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
    await patchJob(
      env,
      api,
      body.job_id.trim(),
      body.job_token.trim(),
      "cloning",
      `Cloning ${body.owner.trim()}/${body.repo.trim()}@${(body.branch || "main").trim()}`,
    );

    // Queue consumer has a long wall clock; waitUntil on service-binding callees does not.
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
        await runJob(env, msg.body);
        msg.ack();
      } catch (e) {
        console.error("queue runJob", e);
        msg.retry();
      }
    }
  },
};
