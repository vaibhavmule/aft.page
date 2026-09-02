import { getSandbox, type Sandbox } from "@cloudflare/sandbox";
import { CONTAINER_PUBLISH_PORT, sandboxIdForJob } from "./origin";
import { viteChunkWarnIsOnlyFail } from "./vite-chunk-warn";
import { completeJob, DEFAULT_API, failJob, patchJob, scrub } from "./job-api";
import { thinkTurn, MAX_REPAIR_TURNS } from "./think";
import { writePy, type AgentTurn } from "./tools";
import { ensureRuntime } from "./ensure-runtime";
import {
  classifySqliteTry,
  DJANGO_SQLITE_OVERRIDE_PY,
  NEED_PG_FAIL,
  RAILS_SQLITE_OVERRIDE_PY,
  trySqliteEnv,
} from "./try-sqlite";
import type { Env, Plan, RunBody } from "./types";

const JOB_DEADLINE_MS = 12 * 60 * 1000;

function cmdOut(r: { stdout?: string; stderr?: string }): string {
  return `${r.stderr || ""}\n${r.stdout || ""}`.trim();
}

function isDockerPlan(plan: Plan): boolean {
  const s = `${plan.stack || ""} ${plan.start || ""} ${plan.build || ""}`.toLowerCase();
  return s.includes("docker");
}

function sandboxBinding(env: Env, docker: boolean): DurableObjectNamespace<Sandbox> {
  if (docker && env.SandboxDind) return env.SandboxDind;
  return env.Sandbox;
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

function pythonInstallCmd(cmd: string): string {
  return cmd.replace(/^(pip3?)\s+/, "python3 -m pip ");
}

function envPrefix(extra: Record<string, string>): string {
  return Object.entries(extra)
    .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
    .join(" ");
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

async function probeHttp(
  sandbox: Sandbox,
  port: number,
  slug: string,
): Promise<string | null> {
  const host = `${slug}.aft.page`;
  const py = `
import urllib.request
req = urllib.request.Request("http://127.0.0.1:${port}/", headers={"Host": ${JSON.stringify(host)}})
try:
    with urllib.request.urlopen(req, timeout=8) as r:
        body = r.read(800).decode("utf-8", "replace")
        print("http", r.status, body[:200])
except urllib.error.HTTPError as e:
    body = e.read().decode("utf-8", "replace")[:800]
    print("http", e.code, body)
except Exception as e:
    print("http_err", e)
`;
  const r = await sandbox.exec(`python3 -c ${JSON.stringify(py)}`);
  const out = cmdOut(r);
  if (/DisallowedHost|Invalid HTTP_HOST|ALLOWED_HOSTS/i.test(out)) {
    return `Host ${host} was rejected. Set ALLOWED_HOSTS for the try URL. ${out.slice(0, 200)}`;
  }
  if (/CSRF/i.test(out) && /403|400/.test(out)) {
    return `CSRF blocked the try URL. Set CSRF_TRUSTED_ORIGINS. ${out.slice(0, 200)}`;
  }
  return null;
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

async function dropStdlibBackports(sandbox: Sandbox, appRoot: string): Promise<void> {
  const py =
    'from pathlib import Path; p=Path("requirements.txt"); p.is_file() and p.write_text("".join(ln for ln in p.read_text(encoding="utf-8").splitlines(True) if "backports.zoneinfo" not in ln.split("#")[0].lower()), encoding="utf-8")';
  await sandbox.exec(`cd ${appRoot} && python3 -c ${JSON.stringify(py)}`);
}

async function snapshotTree(sandbox: Sandbox, appRoot: string): Promise<string> {
  const ls = await sandbox.exec(
    `cd ${appRoot} && find . -type f ! -path './.git/*' ! -path './node_modules/*' ! -path './__pycache__/*' ! -path './vendor/*' | head -80`,
  );
  const names = (ls.stdout || "").trim();
  const peek = await sandbox.exec(
    `cd ${appRoot} && python3 -c ${JSON.stringify(`
from pathlib import Path
root = Path(".")
want = ["package.json", "requirements.txt", "pyproject.toml", ".env", ".env.example", "manage.py", "app.py", "wsgi.py", "mix.exs", "mix.lock", "Gemfile", "Gemfile.lock", "config/database.yml", "config/runtime.exs", "config/dev.exs", "config/config.exs", "Dockerfile"]
chunks = []
for p in root.rglob("settings.py"):
    if ".git" in p.parts: continue
    want.append(str(p))
    break
for rel in want:
    p = root / rel
    if p.is_file():
        chunks.append("## " + rel + "\\n" + p.read_text(encoding="utf-8", errors="replace")[:4000])
print("\\n".join(chunks)[:8000])
`)}`,
  );
  return `${names}\n${peek.stdout || ""}`.slice(0, 8000);
}

async function execPy(sandbox: Sandbox, py: string): Promise<{ success: boolean; stdout?: string; stderr?: string }> {
  const bytes = new TextEncoder().encode(py);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  const b64 = btoa(bin);
  return sandbox.exec(
    `python3 -c ${JSON.stringify(`import base64; exec(base64.b64decode("${b64}").decode())`)}`,
  );
}

async function applyTurn(
  sandbox: Sandbox,
  appRoot: string,
  turn: AgentTurn,
): Promise<string | null> {
  for (const w of turn.writes || []) {
    const py = writePy(appRoot, w);
    if (!py) return `rejected path ${w.path}`;
    const r = await execPy(sandbox, py);
    if (!r.success) return cmdOut(r).slice(0, 240);
  }
  return null;
}

async function agentPass(
  env: Env,
  args: {
    api: string;
    jobId: string;
    jobToken: string;
    slug: string;
    plan: Plan;
    sandbox: Sandbox;
    appRoot: string;
    extraEnv: Record<string, string>;
    error?: string;
  },
): Promise<{ fail?: string; extraEnv: Record<string, string> }> {
  await patchJob(env, args.api, args.jobId, args.jobToken, "installing", "Planning");
  const tree = await snapshotTree(args.sandbox, args.appRoot);
  const turn = await thinkTurn(env, {
    slug: args.slug,
    plan: args.plan,
    tree,
    error: args.error,
  });
  if (!turn) {
    await patchJob(env, args.api, args.jobId, args.jobToken, "installing", "No patches");
    return { extraEnv: args.extraEnv };
  }
  if (turn.fail) return { fail: turn.fail, extraEnv: args.extraEnv };
  if (turn.writes?.length) {
    await patchJob(env, args.api, args.jobId, args.jobToken, "installing", "Patching");
    const err = await applyTurn(args.sandbox, args.appRoot, turn);
    if (err) return { fail: err, extraEnv: args.extraEnv };
    const pyWrites = turn.writes.filter((w) => w.path.endsWith(".py"));
    if (pyWrites.length) {
      await patchJob(env, args.api, args.jobId, args.jobToken, "installing", "Checking");
      for (const w of pyWrites) {
        const chk = await args.sandbox.exec(
          `python3 -m py_compile ${JSON.stringify(args.appRoot + "/" + w.path)}`,
        );
        if (!chk.success) {
          return { fail: `Check failed: ${cmdOut(chk).slice(0, 200)}`, extraEnv: args.extraEnv };
        }
      }
    }
  }
  const extraEnv = { ...args.extraEnv, ...(turn.env || {}) };
  const line = turn.note || (turn.env?.DATABASE_URL ? "Using sqlite for try" : "Patched");
  await patchJob(env, args.api, args.jobId, args.jobToken, "installing", line);
  return { extraEnv };
}

export async function runDeploy(env: Env, body: RunBody): Promise<void> {
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
    // DinD path uses SandboxDind when bound; otherwise honest fail after try.
  }

  const docker = isDockerPlan(plan);
  const sandboxId = sandboxIdForJob(jobId);
  const appDir = "app";
  const workdir = `/workspace/${appDir}`;
  const appRoot = appWorkdir(workdir, plan);
  const ns = sandboxBinding(env, docker);
  if (docker && !env.SandboxDind) {
    await failJob(
      env,
      api,
      jobId,
      jobToken,
      "Dockerfile apps need the DinD runner (SandboxDind). Language stacks (Rails, Django, Express, …) work on the default runner.",
    );
    return;
  }
  const sandbox = getSandbox(ns, sandboxId, {
    normalizeId: true,
    sleepAfter: "30m",
    transport: "rpc",
  });
  // Do not hang flags on the sandbox stub — Proxy may not retain ad-hoc props.
  let dockerLive = false;

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
    await patchJob(
      env,
      api,
      jobId,
      jobToken,
      "cloning",
      `runner=${docker ? "dind" : "lang"} stack=${plan.stack || "?"}`,
    );

    const secrets = sanitizeEnv(body.env);
    let extraEnv: Record<string, string> = {};
    const uiRoot = plan.frontendRoot ? nestedWorkdir(workdir, plan.frontendRoot) : null;
    const publicPort = CONTAINER_PUBLISH_PORT;
    const apiPort = uiRoot ? 5000 : port;

    if (docker) {
      const ready = await sandbox.exec("docker version");
      if (!ready.success) {
        await failJob(
          env,
          api,
          jobId,
          jobToken,
          `Docker daemon not ready in DinD runner. ${cmdOut(ready).slice(0, 300)}`,
        );
        return;
      }
      const buildCmd =
        plan.build || "docker build --network=host -t aft-run .";
      await patchJob(env, api, jobId, jobToken, "building", buildCmd);
      deadline();
      const built = await sandbox.exec(`cd ${appRoot} && ${buildCmd}`);
      const bout = cmdOut(built);
      if (bout) await patchJob(env, api, jobId, jobToken, "building", bout.slice(-1800));
      if (!built.success) {
        await failJob(env, api, jobId, jobToken, `docker build failed: ${bout.slice(0, 400)}`);
        return;
      }
      const startCmd =
        plan.start ||
        `docker run --network=host --rm -e PORT=${publicPort} -p ${publicPort}:${publicPort} aft-run`;
      await patchJob(env, api, jobId, jobToken, "building", `Starting ${plan.stack || "Docker"}`);
      const proc = await sandbox.startProcess(`cd ${appRoot} && ${startCmd}`, {
        cwd: appRoot,
        env: { ...secrets, PORT: String(publicPort), HOST: "0.0.0.0" },
      });
      const ok = await waitForListen(sandbox, publicPort, proc, deadline, async (blob) => {
        await patchJob(env, api, jobId, jobToken, "building", blob);
      });
      if (!ok) {
        await failJob(env, api, jobId, jobToken, `Docker app did not listen on ${publicPort}.`);
        return;
      }
      dockerLive = true;
    }

    let listenPort = publicPort;
    if (!dockerLive) {
    const tree = await snapshotTree(sandbox, appRoot);
    const sqliteKind = classifySqliteTry({
      tree,
      stack: plan.stack,
      hasDatabaseUrl: Boolean(secrets.DATABASE_URL),
    });
    await patchJob(
      env,
      api,
      jobId,
      jobToken,
      "installing",
      `try-db=${sqliteKind} stack=${plan.stack || "?"} install=${plan.install ? "yes" : "no"}`,
    );
    if (sqliteKind === "need-pg") {
      await failJob(env, api, jobId, jobToken, NEED_PG_FAIL);
      return;
    }
    if (sqliteKind === "orm") {
      extraEnv = trySqliteEnv(plan.stack);
      await sandbox.exec(`cd ${appRoot} && python3 -c ${JSON.stringify(DJANGO_SQLITE_OVERRIDE_PY)}`);
      if (/\brails\b/i.test(plan.stack || "")) {
        await sandbox.exec(`cd ${appRoot} && python3 -c ${JSON.stringify(RAILS_SQLITE_OVERRIDE_PY)}`);
      }
      await patchJob(env, api, jobId, jobToken, "installing", "Using sqlite for try");
    }

    // ponytail: first-pass invent only when plan is incomplete or orm hosts need a look.
    // Full invent on Express with a good start was rewriting index.js into syntax errors.
    let first: { fail?: string; extraEnv: Record<string, string> } = { extraEnv };
    if (sqliteKind === "orm" || !plan.start || !plan.install) {
      first = await agentPass(env, {
        api,
        jobId,
        jobToken,
        slug,
        plan,
        sandbox,
        appRoot,
        extraEnv,
      });
      if (first.fail) {
        await failJob(env, api, jobId, jobToken, first.fail);
        return;
      }
      extraEnv = first.extraEnv;
    } else {
      await patchJob(env, api, jobId, jobToken, "installing", "Plan has install+start; skip first invent");
    }

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

    const runInstallBuild = async (): Promise<string | null> => {
      if (plan.install) {
        deadline();
        const installCmd = pythonInstallCmd(plan.install);
        const runtime = await ensureRuntime(sandbox, plan.stack, installCmd);
        if (runtime.label !== "none") {
          await patchJob(
            env,
            api,
            jobId,
            jobToken,
            "installing",
            `Installing runtime: ${runtime.label}`,
          );
        }
        if (runtime.error) return `Install failed: ${runtime.error}`;
        if (/\bpip\b/.test(installCmd)) {
          await dropStdlibBackports(sandbox, appRoot);
        }
        await patchJob(env, api, jobId, jobToken, "installing", installCmd);
        const prefix = envPrefix(extraEnv);
        const inst = await sandbox.exec(
          `cd ${appRoot} && ${prefix ? prefix + " " : ""}${installCmd}`,
        );
        const out = cmdOut(inst);
        if (out) await patchJob(env, api, jobId, jobToken, "installing", out.slice(-1800));
        if (!inst.success) return `Install failed: ${out.slice(0, 400)}`;
        if (/\bnpm\b/.test(installCmd)) {
          const peers = await installMissingPeers(sandbox, appRoot);
          if (peers) await patchJob(env, api, jobId, jobToken, "installing", peers.slice(-1800));
        }
        await patchJob(env, api, jobId, jobToken, "installing", "install done");
      }
      if (plan.build && !isDockerPlan(plan)) {
        deadline();
        await patchJob(env, api, jobId, jobToken, "building", plan.build);
        const prefix = envPrefix(extraEnv);
        const built = await sandbox.exec(
          `cd ${appRoot} && ${prefix ? prefix + " " : ""}${plan.build}`,
        );
        const bout = cmdOut(built);
        if (bout) await patchJob(env, api, jobId, jobToken, "building", bout.slice(-1800));
        if (!built.success) return `Build failed: ${bout.slice(0, 400)}`;
      }
      return null;
    };

    let stepErr = await runInstallBuild();
    for (let turn = 0; stepErr && turn < MAX_REPAIR_TURNS; turn++) {
      const fix = await agentPass(env, {
        api,
        jobId,
        jobToken,
        slug,
        plan,
        sandbox,
        appRoot,
        extraEnv,
        error: stepErr,
      });
      if (fix.fail) {
        await failJob(env, api, jobId, jobToken, fix.fail);
        return;
      }
      extraEnv = fix.extraEnv;
      stepErr = await runInstallBuild();
    }
    if (stepErr) {
      await failJob(env, api, jobId, jobToken, stepErr);
      return;
    }

    const startCmd = plan.start;
    if (!startCmd) {
      await failJob(env, api, jobId, jobToken, "No start command in the build plan.");
      return;
    }

    const tryStart = async (): Promise<string | null> => {
      deadline();
      const apiStart = retargetStart(startCmd, apiPort);
      await patchJob(env, api, jobId, jobToken, "building", `Starting ${plan.stack || "app"}`);
      const proc = await sandbox.startProcess(
        `cd ${appRoot} && PORT=${apiPort} HOST=0.0.0.0 ALLOWED_HOSTS=* ${apiStart}`,
        {
          cwd: appRoot,
          env: {
            ...secrets,
            ...extraEnv,
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
        try {
          const killer = proc as { kill?: () => Promise<unknown> };
          if (typeof killer.kill === "function") await killer.kill();
        } catch {
          /* ignore */
        }
        return hint;
      }
      const hostErr = await probeHttp(sandbox, apiPort, slug);
      if (hostErr) {
        try {
          const killer = proc as { kill?: () => Promise<unknown> };
          if (typeof killer.kill === "function") await killer.kill();
        } catch {
          /* ignore */
        }
        return hostErr;
      }
      return null;
    };

    let startErr = await tryStart();
    for (let turn = 0; startErr && turn < MAX_REPAIR_TURNS; turn++) {
      const fix = await agentPass(env, {
        api,
        jobId,
        jobToken,
        slug,
        plan,
        sandbox,
        appRoot,
        extraEnv,
        error: startErr,
      });
      if (fix.fail) {
        await failJob(env, api, jobId, jobToken, fix.fail);
        return;
      }
      extraEnv = fix.extraEnv;
      startErr = await tryStart();
    }
    if (startErr) {
      await failJob(env, api, jobId, jobToken, startErr);
      return;
    }

    listenPort = apiPort;
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
    } // end language path (!dockerLive)

    deadline();
    await patchJob(env, api, jobId, jobToken, "deploying", "Publishing");
    // SDK: Tunnel recovery exhausted → destroy + retry same port (runtime fence).
    let upstream = "";
    let tunnelErr = "";
    for (let attempt = 0; attempt < 3 && !upstream; attempt++) {
      try {
        if (attempt > 0) {
          await sandbox.tunnels.destroy(listenPort).catch(() => null);
          await new Promise((r) => setTimeout(r, 1500 * attempt));
        }
        const tunnel = await sandbox.tunnels.get(listenPort);
        upstream = tunnel.url || "";
      } catch (e) {
        tunnelErr = e instanceof Error ? e.message : String(e);
      }
    }
    if (!upstream) {
      await failJob(
        env,
        api,
        jobId,
        jobToken,
        tunnelErr || "Could not get a public URL for the process.",
      );
      return;
    }
    await completeJob(env, api, jobId, jobToken, upstream);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await failJob(env, api, jobId, jobToken, msg.slice(0, 500));
  }
}
