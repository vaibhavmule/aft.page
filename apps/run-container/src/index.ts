/** Run container jobs: Sandbox clone → install → start → public URL → AFT complete. */
import { getSandbox, proxyToSandbox, type Sandbox } from "@cloudflare/sandbox";
import { CONTAINER_PUBLISH_PORT, isSandboxId, sandboxIdForJob } from "./origin";
import { viteChunkWarnIsOnlyFail } from "./vite-chunk-warn";

export { Sandbox } from "@cloudflare/sandbox";

type Plan = {
  stack?: string;
  install?: string;
  start?: string;
  build?: string;
  port?: number;
  root?: string;
  frontendRoot?: string;
  frontendInstall?: string;
  frontendBuild?: string;
  frontendOutputDirs?: string[];
};

type RunBody = {
  job_id?: string;
  job_token?: string;
  owner?: string;
  repo?: string;
  slug?: string;
  branch?: string;
  plan?: Plan | null;
  env?: Record<string, string> | null;
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

function nestedWorkdir(workdir: string, root?: string): string {
  const raw = (root || "").replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
  if (!raw || raw.includes("..") || raw.startsWith(".")) return workdir;
  if (!/^[A-Za-z0-9._/-]+$/.test(raw)) return workdir;
  return `${workdir}/${raw}`;
}

function appWorkdir(workdir: string, plan: Plan): string {
  return nestedWorkdir(workdir, plan.root);
}

function sanitizeEnv(raw: Record<string, string> | null | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!raw) return out;
  for (const [key, value] of Object.entries(raw)) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    if (typeof value !== "string" || value.length > 8192) continue;
    out[key] = value;
  }
  return out;
}

function retargetStart(cmd: string, port: number): string {
  return cmd
    .replace(/--port\s+\d+/g, `--port ${port}`)
    .replace(/0\.0\.0\.0:\d+/g, `0.0.0.0:${port}`)
    .replace(/:8080\b/g, `:${port}`);
}

const SPLIT_PROXY_JS = `const http = require('http');
const fs = require('fs');
const path = require('path');
const dist = process.env.AFT_UI_DIST;
const apiPort = process.env.AFT_API_PORT || '5000';
const port = process.env.PORT || '8080';
const mime = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.woff': 'font/woff',
  '.map': 'application/json', '.txt': 'text/plain', '.webp': 'image/webp'
};
function proxy(req, res) {
  const p = http.request({
    hostname: '127.0.0.1', port: apiPort, path: req.url,
    method: req.method, headers: req.headers
  }, (up) => { res.writeHead(up.statusCode, up.headers); up.pipe(res); });
  p.on('error', () => { res.statusCode = 502; res.end('API unavailable'); });
  req.pipe(p);
}
http.createServer((req, res) => {
  const u = (req.url || '/').split('?')[0];
  if (u.startsWith('/api') || u.startsWith('/uploads')) return proxy(req, res);
  const rel = u === '/' ? 'index.html' : decodeURIComponent(u).replace(/^\/+/, '');
  let file = path.join(dist, rel);
  if (!file.startsWith(dist)) { res.statusCode = 403; return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) {
      fs.readFile(path.join(dist, 'index.html'), (e2, html) => {
        if (e2) { res.statusCode = 404; return res.end('Not found'); }
        res.setHeader('content-type', 'text/html');
        res.end(html);
      });
      return;
    }
    res.setHeader('content-type', mime[path.extname(file)] || 'application/octet-stream');
    res.end(data);
  });
}).listen(Number(port), '0.0.0.0');
`;

async function waitForListen(
  sandbox: Sandbox,
  port: number,
  proc: {
    waitForPort: (
      p: number,
      o?: { mode?: "tcp" | "http"; timeout?: number },
    ) => Promise<unknown>;
    getLogs: () => Promise<{ stdout?: string; stderr?: string }>;
  },
  deadline: () => void,
  patch: (blob: string) => Promise<void>,
): Promise<boolean> {
  let ready = false;
  try {
    await proc.waitForPort(port, { mode: "tcp", timeout: 60_000 });
    ready = true;
  } catch {
    /* fall through */
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
        if (blob) await patch(blob);
      } catch {
        /* ignore */
      }
    }
  }
  return ready;
}

async function installMissingPeers(sandbox: Sandbox, appRoot: string): Promise<string> {
  const peer = await sandbox.exec(
    `cd ${appRoot} && python3 -c ${JSON.stringify(`
import json, pathlib, re, subprocess
root = pathlib.Path(".")
pkgp = root / "package.json"
if not pkgp.is_file():
    raise SystemExit(0)
pkg = json.loads(pkgp.read_text())
names = list(pkg.get("dependencies") or {}) + list(pkg.get("devDependencies") or {})
safe = re.compile(r"^(@[A-Za-z0-9._-]+/)?[A-Za-z0-9._-]+$")
missing = []
for name in names:
    p = root / "node_modules" / name / "package.json"
    if not p.is_file():
        continue
    peers = json.loads(p.read_text()).get("peerDependencies") or {}
    for peer in peers:
        if not safe.match(peer):
            continue
        if not (root / "node_modules" / peer).exists():
            missing.append(peer)
missing = sorted(set(missing))
if not missing:
    raise SystemExit(0)
print("missing peers:", " ".join(missing))
subprocess.check_call(["npm", "install", "--no-save", "--legacy-peer-deps", *missing])
`)}`,
  );
  return cmdOut(peer);
}

function pythonInstallCmd(cmd: string): string {
  return cmd.replace(/^(pip3?)\s+/, "python3 -m pip ");
}

async function dropStdlibBackports(sandbox: Sandbox, appRoot: string): Promise<void> {
  // ponytail: Django 4 tutorials pin backports.zoneinfo; stdlib on 3.9+, no cp310 wheel, source needs gcc. Upgrade: compilers in image.
  // One line: sandbox shell does not expand JSON \n into real newlines for python3 -c.
  const py =
    'from pathlib import Path; p=Path("requirements.txt"); p.is_file() and p.write_text("".join(ln for ln in p.read_text(encoding="utf-8").splitlines(True) if "backports.zoneinfo" not in ln.split("#")[0].lower()), encoding="utf-8")';
  await sandbox.exec(`cd ${appRoot} && python3 -c ${JSON.stringify(py)}`);
}

function djangoCsrfSnippet(slug: string): string {
  return `\nCSRF_TRUSTED_ORIGINS = ['https://${slug}.aft.page', 'https://*.aft.page']\n`;
}

async function relaxDjangoHosts(sandbox: Sandbox, appRoot: string, slug: string): Promise<void> {
  // ponytail: DEBUG startprojects ship ALLOWED_HOSTS = []. Try URLs need * or DisallowedHost. Upgrade: read Host from env.
  await sandbox.exec(
    `cd ${appRoot} && find . -name settings.py -exec sed -i "s/ALLOWED_HOSTS = \\[\\]/ALLOWED_HOSTS = ['*']/g" {} +`,
  );
  // Django 4+ CSRF Origin is https://{slug}.aft.page; runserver behind the tunnel is http.
  // Exact origin: Django 4.0. Wildcard: 4.1+ and {hex}--{slug} preview hosts.
  // One line: sandbox shell does not expand JSON \n into real newlines for python3 -c.
  const py = `from pathlib import Path; s=${JSON.stringify(djangoCsrfSnippet(slug))}; [p.write_text(p.read_text(encoding="utf-8")+s, encoding="utf-8") for p in Path(".").rglob("settings.py")]`;
  await sandbox.exec(`cd ${appRoot} && python3 -c ${JSON.stringify(py)}`);
}

async function ensurePythonPip(sandbox: Sandbox): Promise<string | null> {
  const have = await sandbox.exec("python3 -m pip --version");
  if (have.success) return null;
  const ep = await sandbox.exec("python3 -m ensurepip --upgrade");
  if (ep.success) return null;
  const apt = await sandbox.exec(
    "apt-get update -qq && DEBIAN_FRONTEND=noninteractive apt-get install -y -qq python3-pip python3-venv",
  );
  if (apt.success) return null;
  return `Could not install pip. ${cmdOut(have)}\n${cmdOut(ep)}\n${cmdOut(apt)}`.slice(0, 400);
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
  const port = CONTAINER_PUBLISH_PORT;

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
  const sandboxId = sandboxIdForJob(jobId);
  const appDir = "app";
  const workdir = `/workspace/${appDir}`;
  const appRoot = appWorkdir(workdir, plan);
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
    const ls = await sandbox.exec(`test -d ${appRoot} && echo ok || ls -la /workspace`);
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

    const secrets = sanitizeEnv(body.env);
    const uiRoot = plan.frontendRoot ? nestedWorkdir(workdir, plan.frontendRoot) : null;
    const publicPort = CONTAINER_PUBLISH_PORT;
    const apiPort = uiRoot ? 5000 : port;

    if (uiRoot) {
      const uiLs = await sandbox.exec(`test -d ${uiRoot} && echo ok`);
      if (!uiLs.success || !(uiLs.stdout || "").includes("ok")) {
        await failJob(env, api, jobId, jobToken, `UI folder ${plan.frontendRoot} was not in the clone.`);
        return;
      }
      if (plan.frontendInstall) {
        deadline();
        await patchJob(env, api, jobId, jobToken, "installing", `UI: ${plan.frontendInstall}`);
        const inst = await sandbox.exec(`cd ${uiRoot} && ${plan.frontendInstall}`);
        const out = cmdOut(inst);
        if (out) await patchJob(env, api, jobId, jobToken, "installing", out.slice(-1800));
        if (!inst.success) {
          await failJob(env, api, jobId, jobToken, `UI install failed: ${out.slice(0, 400)}`);
          return;
        }
        const peers = await installMissingPeers(sandbox, uiRoot);
        if (peers) await patchJob(env, api, jobId, jobToken, "installing", peers.slice(-1800));
      }
      if (plan.frontendBuild) {
        deadline();
        const buildCmd = `VITE_API_URL= VITE_BACKEND_URL= ${plan.frontendBuild}`;
        await patchJob(env, api, jobId, jobToken, "building", `UI: ${plan.frontendBuild}`);
        const built = await sandbox.exec(`cd ${uiRoot} && ${buildCmd}`);
        const bout = cmdOut(built);
        if (bout) await patchJob(env, api, jobId, jobToken, "building", bout.slice(-1800));
        if (!built.success) {
          if (viteChunkWarnIsOnlyFail(bout)) {
            await patchJob(
              env,
              api,
              jobId,
              jobToken,
              "building",
              "UI wrote dist; Vite treated a large JS chunk as an error.",
            );
          } else {
            await failJob(env, api, jobId, jobToken, `UI build failed: ${bout.slice(0, 400)}`);
            return;
          }
        }
      }
    }

    if (plan.install) {
      deadline();
      const installCmd = pythonInstallCmd(plan.install);
      if (/\bpip\b/.test(installCmd)) {
        const pipErr = await ensurePythonPip(sandbox);
        if (pipErr) {
          await failJob(env, api, jobId, jobToken, `Install failed: ${pipErr}`);
          return;
        }
        await dropStdlibBackports(sandbox, appRoot);
      }
      await patchJob(env, api, jobId, jobToken, "installing", installCmd);
      const inst = await sandbox.exec(`cd ${appRoot} && ${installCmd}`);
      const out = cmdOut(inst);
      if (out) await patchJob(env, api, jobId, jobToken, "installing", out.slice(-1800));
      if (!inst.success) {
        await failJob(env, api, jobId, jobToken, `Install failed: ${out.slice(0, 400)}`);
        return;
      }
      if (/\bnpm\b/.test(installCmd)) {
        const peers = await installMissingPeers(sandbox, appRoot);
        if (peers) await patchJob(env, api, jobId, jobToken, "installing", peers.slice(-1800));
      }
      await patchJob(env, api, jobId, jobToken, "installing", "install done");
    }

    if (plan.build && !isDockerPlan(plan)) {
      deadline();
      await patchJob(env, api, jobId, jobToken, "building", plan.build);
      const built = await sandbox.exec(`cd ${appRoot} && ${plan.build}`);
      const bout = cmdOut(built);
      if (bout) await patchJob(env, api, jobId, jobToken, "building", bout.slice(-1800));
      if (!built.success) {
        await failJob(env, api, jobId, jobToken, `Build failed: ${bout.slice(0, 400)}`);
        return;
      }
    }

    const startCmd = plan.start;
    if (!startCmd) {
      await failJob(env, api, jobId, jobToken, "No start command in the build plan.");
      return;
    }

    if ((plan.stack || "").toLowerCase().includes("django")) {
      await relaxDjangoHosts(sandbox, appRoot, slug);
    }

    deadline();
    const apiStart = retargetStart(startCmd, apiPort);
    await patchJob(env, api, jobId, jobToken, "building", `Starting ${plan.stack || "app"}`);
    const proc = await sandbox.startProcess(
      `cd ${appRoot} && PORT=${apiPort} HOST=0.0.0.0 ALLOWED_HOSTS=* ${apiStart}`,
      {
        cwd: appRoot,
        env: {
          ...secrets,
          PORT: String(apiPort),
          HOST: "0.0.0.0",
          ALLOWED_HOSTS: "*",
        },
      },
    );

    const apiReady = await waitForListen(sandbox, apiPort, proc, deadline, async (blob) => {
      await patchJob(env, api, jobId, jobToken, "building", blob);
    });
    if (!apiReady) {
      let hint = `App did not listen on port ${apiPort} in time.`;
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

    let listenPort = apiPort;
    if (uiRoot) {
      const dirs = (plan.frontendOutputDirs || ["dist", "out", "build"]).join(",");
      const found = await sandbox.exec(
        `python3 -c ${JSON.stringify(`
import os
root = ${JSON.stringify(uiRoot)}
cands = ${JSON.stringify(plan.frontendOutputDirs || ["dist", "out", "build"])}
for d in cands:
    p = os.path.join(root, d)
    if os.path.isfile(os.path.join(p, "index.html")):
        print(p); break
    if os.path.isdir(p):
        for dirpath, _, names in os.walk(p):
            if "index.html" in names and dirpath[len(p):].count(os.sep) <= 3:
                print(dirpath); raise SystemExit
if os.path.isfile(os.path.join(root, "index.html")):
    print(root)
`)}`,
      );
      const dist = (found.stdout || "").trim().split("\n").filter(Boolean).pop();
      if (!dist) {
        await failJob(
          env,
          api,
          jobId,
          jobToken,
          `UI built but no index.html under ${dirs}. If the SPA hardcodes localhost, it will not hit this API.`,
        );
        return;
      }
      const proxyPath = `${workdir}/.aft-proxy.js`;
      const write = await sandbox.exec(
        `python3 -c ${JSON.stringify(`from pathlib import Path; Path(${JSON.stringify(proxyPath)}).write_text(${JSON.stringify(SPLIT_PROXY_JS)}, encoding="utf-8")`)}`,
      );
      if (!write.success) {
        await failJob(env, api, jobId, jobToken, `Could not write UI proxy: ${cmdOut(write).slice(0, 200)}`);
        return;
      }
      await patchJob(env, api, jobId, jobToken, "building", "Starting UI + API");
      const proxyProc = await sandbox.startProcess(`node ${proxyPath}`, {
        cwd: workdir,
        env: {
          PORT: String(publicPort),
          AFT_UI_DIST: dist,
          AFT_API_PORT: String(apiPort),
        },
      });
      const proxyReady = await waitForListen(sandbox, publicPort, proxyProc, deadline, async (blob) => {
        await patchJob(env, api, jobId, jobToken, "building", blob);
      });
      if (!proxyReady) {
        await failJob(env, api, jobId, jobToken, "UI proxy did not listen in time.");
        return;
      }
      listenPort = publicPort;
    }

    deadline();
    await patchJob(env, api, jobId, jobToken, "deploying", "Publishing");
    const tunnel = await sandbox.tunnels.get(listenPort);
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
