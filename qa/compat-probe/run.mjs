#!/usr/bin/env node
/**
 * Find random GitHub framework repos → clone → npm build → aft deploy → log URL or fail.
 *
 *   node qa/compat-probe/run.mjs
 *   node qa/compat-probe/run.mjs --count 5
 *   node qa/compat-probe/run.mjs --repo owner/name
 *
 * Failures are logged, not thrown. Check qa/compat-probe/logs/.
 */
import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { randomInt } from "node:crypto";
import {
  SEARCH_BUCKETS,
  detectFromManifest,
  probeSlug,
  skipReason,
} from "./detect.mjs";
import { capCheck } from "./limits.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../..");
const cli = join(repoRoot, "apps/cli/bin/aft.js");
const logsDir = join(here, "logs");
const count = Math.max(1, Number(flag("--count") || 5));
const forcedRepo = flag("--repo");
const PICK_TRIES = 8;
const probeToken = process.env.AFT_PROBE_TOKEN || "";

const results = [];
const work = await mkdtemp(join(tmpdir(), "aft-compat-"));

try {
  for (let i = 1; i <= count; i++) {
    const slug = probeSlug(i);
    const bucket = SEARCH_BUCKETS[(i - 1) % SEARCH_BUCKETS.length];
    results.push(await probeOne({ i, slug, bucket, forcedRepo: i === 1 ? forcedRepo : null }));
  }
} finally {
  await rm(work, { recursive: true, force: true }).catch(() => {});
}

await mkdir(logsDir, { recursive: true });
const day = new Date().toISOString().slice(0, 10);
const logPath = join(logsDir, `${day}.json`);
const latestPath = join(logsDir, "latest.json");
const prior = await readJsonArray(logPath);
const payload = {
  at: new Date().toISOString(),
  probes: results,
};
const dayLog = [...prior, payload];
await writeFile(logPath, `${JSON.stringify(dayLog, null, 2)}\n`);
await writeFile(latestPath, `${JSON.stringify(payload, null, 2)}\n`);

const okN = results.filter((r) => r.ok).length;
console.log("\ncompat probe");
console.table(
  results.map((r) => ({
    n: r.n,
    ok: r.ok ? "yes" : "no",
    repo: r.repo || "",
    framework: r.framework || "",
    reason: r.reason || "",
    url: r.url || "",
    ms: r.ms,
  })),
);
console.log(`\n${okN}/${results.length} live. log: ${logPath}`);
if (!okN) console.log("none deployed — open the log and check skip/fail reasons.");

async function probeOne({ i, slug, bucket, forcedRepo }) {
  const started = Date.now();
  const base = { n: i, slug, bucket: bucket.id, ok: false, repo: null, framework: null, reason: null, url: null, ms: 0, detail: "" };
  let deployedUrl = null;

  if (!probeToken) {
    return done(base, {
      reason: "aft_probe_token_missing",
      detail: "Set AFT_PROBE_TOKEN to an aft.page bearer token that owns probe sites.",
      ms: Date.now() - started,
    });
  }

  try {
    const picked = forcedRepo
      ? await loadRepo(forcedRepo)
      : await pickRepo(bucket);
    if (!picked.ok) {
      return done(base, { reason: picked.reason, detail: picked.detail, ms: Date.now() - started });
    }

    const { repo, detected } = picked;
    base.repo = repo.full_name;
    base.framework = detected.framework;
    console.log(`\n[${i}/${count}] ${repo.full_name} (${detected.label}) → ${slug}`);

    const dir = join(work, `p${i}`);
    const clone = await run("git", ["clone", "--depth", "1", repo.clone_url, dir], {
      timeoutMs: 120_000,
      env: untrustedEnv(),
    });
    if (!clone.ok) {
      return done(base, { reason: "clone_failed", detail: clone.detail, ms: Date.now() - started });
    }

    if (detected.needsBuild) {
      const install = await run("npm", ["install", "--no-audit", "--no-fund"], {
        cwd: dir,
        timeoutMs: 180_000,
        env: untrustedEnv(),
      });
      if (!install.ok) {
        return done(base, { reason: "install_failed", detail: install.detail, ms: Date.now() - started });
      }
      const build = await run("npm", ["run", detected.buildScript || "build"], {
        cwd: dir,
        timeoutMs: 180_000,
        env: untrustedEnv(),
      });
      if (!build.ok) {
        return done(base, { reason: "build_failed", detail: build.detail, ms: Date.now() - started });
      }
    }

    const deployRoot = join(dir, detected.outDir === "." ? "" : detected.outDir);
    const files = await listFiles(deployRoot);
    if (!files.some((f) => f.path === "index.html" || f.path.endsWith("/index.html"))) {
      return done(base, { reason: "no_index", detail: `no index.html in ${detected.outDir}`, ms: Date.now() - started });
    }
    const cap = capCheck(files);
    if (!cap.ok) {
      return done(base, { reason: cap.reason, detail: cap.detail, ms: Date.now() - started });
    }

    const deploy = await run(process.execPath, [cli, "deploy", ".", "--slug", slug], {
      cwd: dir,
      timeoutMs: 120_000,
      capture: true,
      env: trustedDeployEnv(),
    });
    if (!deploy.ok) {
      return done(base, { reason: "deploy_failed", detail: deploy.detail, ms: Date.now() - started });
    }
    const url = (deploy.stdout || "").split(/\s+/).find((p) => /^https:\/\//.test(p));
    if (!url) {
      return done(base, { reason: "deploy_failed", detail: "CLI printed no URL", ms: Date.now() - started });
    }
    deployedUrl = url;

    const live = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(15_000) }).catch((e) => e);
    if (live instanceof Error || !live.ok) {
      const status = live instanceof Error ? live.message : `HTTP ${live.status}`;
      return finishProbe(base, { reason: "serve_failed", detail: status, url, ms: Date.now() - started });
    }
    const html = await live.text();
    if (!/<html/i.test(html)) {
      return finishProbe(base, { reason: "serve_failed", detail: "response was not HTML", url, ms: Date.now() - started });
    }

    return finishProbe(base, { ok: true, url, reason: null, ms: Date.now() - started });
  } catch (err) {
    const result = {
      reason: "error",
      detail: err instanceof Error ? err.message : String(err),
      ms: Date.now() - started,
      ...(deployedUrl ? { url: deployedUrl } : {}),
    };
    return deployedUrl ? finishProbe(base, result) : done(base, result);
  }
}

async function pickRepo(bucket) {
  const tried = [];
  for (let t = 0; t < PICK_TRIES; t++) {
    const page = randomInt(1, 6);
    const search = await ghJson(
      `https://api.github.com/search/repositories?q=${encodeURIComponent(bucket.q)}&per_page=20&page=${page}`,
    );
    if (!search.ok) return { ok: false, reason: "github_search", detail: search.detail };
    const items = search.json.items || [];
    if (!items.length) continue;
    const repo = items[randomInt(items.length)];
    if (tried.includes(repo.full_name)) continue;
    tried.push(repo.full_name);
    const loaded = await inspectRepo(repo);
    if (loaded.ok) return loaded;
    console.log(`  skip ${repo.full_name}: ${loaded.reason}`);
  }
  return { ok: false, reason: "pick_failed", detail: `no static-capable hit in ${bucket.id} (${tried.join(", ") || "empty"})` };
}

async function loadRepo(fullName) {
  const got = await ghJson(`https://api.github.com/repos/${fullName}`);
  if (!got.ok) return { ok: false, reason: "github_repo", detail: got.detail };
  return inspectRepo(got.json);
}

async function inspectRepo(repo) {
  const sizeSkip = skipReason(repo, { staticDeployable: true, needsBuild: false, skip: null });
  if (sizeSkip === "too_large" || sizeSkip === "mega_repo" || sizeSkip === "too_obscure") {
    return { ok: false, reason: sizeSkip, detail: `${repo.full_name} size=${repo.size} stars=${repo.stargazers_count}` };
  }
  const manifest = await fetchManifest(repo.full_name);
  if (!manifest.ok) return { ok: false, reason: "github_contents", detail: manifest.detail };
  const detected = detectFromManifest(manifest);
  const why = skipReason(repo, detected);
  if (why) return { ok: false, reason: why, detail: detected.label || why };
  return { ok: true, repo, detected };
}

async function fetchManifest(fullName) {
  const root = await ghJson(`https://api.github.com/repos/${fullName}/contents/`);
  if (!root.ok) return root;
  const files = (root.json || []).filter((e) => e.type === "file").map((e) => e.name);
  let pkg = null;
  if (files.includes("package.json")) {
    const raw = await ghFile(fullName, "package.json");
    if (!raw.ok) return raw;
    try {
      pkg = JSON.parse(raw.text);
    } catch {
      return { ok: false, reason: "bad_package_json", detail: fullName };
    }
  }
  const configTexts = {};
  for (const name of ["next.config.js", "next.config.mjs", "next.config.ts"]) {
    if (!files.includes(name)) continue;
    const raw = await ghFile(fullName, name);
    if (raw.ok) configTexts[name] = raw.text;
  }
  return { ok: true, pkg, files, configTexts };
}

async function ghFile(fullName, path) {
  const got = await ghJson(`https://api.github.com/repos/${fullName}/contents/${path}`);
  if (!got.ok) return got;
  const b64 = got.json?.content;
  if (!b64 || got.json.encoding !== "base64") {
    return { ok: false, detail: `no content for ${path}` };
  }
  return { ok: true, text: Buffer.from(b64.replace(/\n/g, ""), "base64").toString("utf8") };
}

async function ghJson(url) {
  const headers = {
    accept: "application/vnd.github+json",
    "user-agent": "aft.page-compat-probe",
  };
  if (process.env.GITHUB_TOKEN) headers.authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  try {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(20_000) });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, detail: `GitHub ${res.status} ${json.message || url}` };
    return { ok: true, json };
  } catch (err) {
    return { ok: false, detail: err instanceof Error ? err.message : String(err) };
  }
}

async function listFiles(root) {
  const out = [];
  async function walk(dir) {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of entries) {
      const abs = join(dir, ent.name);
      const rel = relative(root, abs).split(sep).join("/");
      if (!rel || rel.startsWith("..")) continue;
      if (ent.isDirectory()) {
        if (ent.name === "node_modules" || ent.name === ".git") continue;
        await walk(abs);
        continue;
      }
      if (!ent.isFile()) continue;
      const st = await stat(abs);
      out.push({ path: rel, bytes: st.size });
    }
  }
  await walk(root);
  return out;
}

async function finishProbe(base, extra) {
  const cleanup = await cleanupProbe(extra.url);
  if (!cleanup.ok) {
    return done(base, {
      ...extra,
      ok: false,
      reason: "cleanup_failed",
      detail: cleanup.detail,
    });
  }
  return done(base, extra);
}

async function cleanupProbe(url) {
  try {
    const slug = new URL(url).hostname.split(".")[0];
    if (!slug || !slug.startsWith("test--fw-")) {
      return { ok: false, detail: `unexpected probe URL: ${url}` };
    }
    const res = await fetch(`https://api.aft.page/v1/sites/${encodeURIComponent(slug)}`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${probeToken}` },
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) return { ok: false, detail: `cleanup HTTP ${res.status}` };
    return { ok: true };
  } catch (err) {
    return { ok: false, detail: err instanceof Error ? err.message : String(err) };
  }
}

function baseChildEnv() {
  const env = {
    PATH: process.env.PATH || "",
    HOME: process.env.HOME || "",
    TMPDIR: process.env.TMPDIR || "",
    TMP: process.env.TMP || "",
    TEMP: process.env.TEMP || "",
    LANG: process.env.LANG || "",
    LC_ALL: process.env.LC_ALL || "",
    CI: "true",
    NO_COLOR: "1",
  };
  return Object.fromEntries(Object.entries(env).filter(([, value]) => value));
}

function untrustedEnv() {
  return baseChildEnv();
}

function trustedDeployEnv() {
  return { ...baseChildEnv(), AFT_TOKEN: probeToken, AFT_NO_ANALYTICS: "1" };
}

function run(bin, args, { cwd, timeoutMs = 60_000, capture = false, env = baseChildEnv() } = {}) {
  return new Promise((resolvePromise) => {
    const child = spawn(bin, args, {
      cwd,
      env,
      stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit",
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
    }, timeoutMs);
    child.stdout?.on("data", (c) => (stdout += c));
    child.stderr?.on("data", (c) => (stderr += c));
    child.on("error", (err) => {
      clearTimeout(timer);
      resolvePromise({ ok: false, detail: err.message, stdout, stderr });
    });
    child.on("exit", (code) => {
      clearTimeout(timer);
      if (code === 0) resolvePromise({ ok: true, stdout, stderr });
      else {
        resolvePromise({
          ok: false,
          detail: (stderr || stdout || `exit ${code}`).slice(-800),
          stdout,
          stderr,
        });
      }
    });
  });
}

function done(base, extra) {
  return { ...base, ...extra, ms: extra.ms ?? base.ms };
}

function flag(name) {
  const i = process.argv.indexOf(name);
  return i === -1 ? undefined : process.argv[i + 1];
}

async function readJsonArray(path) {
  try {
    const raw = JSON.parse(await readFile(path, "utf8"));
    return Array.isArray(raw) ? raw : [raw];
  } catch {
    return [];
  }
}
