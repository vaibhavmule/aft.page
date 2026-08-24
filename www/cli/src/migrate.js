/** Import env from other hosts — vercel env pull → aft env vault. */
import { spawnSync } from "node:child_process";
import { access } from "node:fs/promises";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { putEnvSecret } from "./env.js";
import { requireLogin, resolveProject } from "./project.js";
import { note, ok, say } from "./ui.js";
import { liveSiteUrl } from "./site-url.js";

const SKIP_PREFIX = ["VERCEL_", "TURBO_", "NX_"];
const SKIP_EXACT = new Set(["VERCEL"]);

export function parseDotEnv(text) {
  const out = {};
  for (const line of String(text || "").split(/\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq === -1) continue;
    const key = t.slice(0, eq).trim();
    let val = t.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (key) out[key] = val;
  }
  return out;
}

export function filterMigrateKeys(entries, { includeVercel = false } = {}) {
  const out = [];
  for (const [name, value] of entries) {
    if (!value) continue;
    if (!/^[A-Za-z0-9_.-]+$/.test(name)) continue;
    if (!includeVercel && (SKIP_EXACT.has(name) || SKIP_PREFIX.some((p) => name.startsWith(p)))) {
      continue;
    }
    out.push([name, value]);
  }
  return out.sort((a, b) => a[0].localeCompare(b[0]));
}

function pushWorkerSecrets(cwd, pairs, workerName) {
  const bulk = Object.fromEntries(pairs.filter(([, v]) => v));
  if (Object.keys(bulk).length === 0) return { ok: false, reason: "empty" };
  const dir = mkdtempSync(join(tmpdir(), "aft-secrets-"));
  const file = join(dir, "secrets.json");
  try {
    writeFileSync(file, JSON.stringify(bulk));
    const r = spawnSync(
      "npx",
      ["wrangler", "secret", "bulk", file, ...(workerName ? ["--name", workerName] : [])],
      {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
    });
    if (r.status !== 0) {
      const msg = `${r.stderr || ""}\n${r.stdout || ""}`.trim();
      return { ok: false, reason: msg || "wrangler secret bulk failed" };
    }
    return { ok: true };
  } finally {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      /* best effort */
    }
  }
}

async function hasWranglerConfig(cwd) {
  try {
    await access(join(cwd, "wrangler.jsonc"));
    return true;
  } catch {
    try {
      await access(join(cwd, "wrangler.toml"));
      return true;
    } catch {
      return false;
    }
  }
}

function flagValue(args, name) {
  const i = args.indexOf(name);
  if (i === -1) return undefined;
  return args[i + 1];
}

function hasFlag(args, name) {
  return args.includes(name);
}

function vercelOnPath() {
  const r = spawnSync("vercel", ["--version"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return r.status === 0;
}

function pullVercelEnv(cwd, environment) {
  const dir = mkdtempSync(join(tmpdir(), "aft-vercel-"));
  const envPath = join(dir, ".env.vercel");
  try {
    const r = spawnSync(
      "vercel",
      ["env", "pull", envPath, "--environment", environment, "--yes"],
      { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    );
    if (r.status !== 0) {
      const msg = `${r.stderr || ""}\n${r.stdout || ""}`.trim();
      throw new Error(msg || "vercel env pull failed");
    }
    return readFileSync(envPath, "utf8");
  } finally {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      /* best effort */
    }
  }
}

export async function cmdMigrate(args) {
  const [target, ...rest] = args;
  switch (target) {
    case "vercel":
      return cmdMigrateVercel(rest);
    case "-h":
    case "--help":
    case "help":
    case undefined:
      console.log(`Usage:
  aft migrate vercel [--environment production|preview|development] [--dry-run]

Pull env from linked Vercel project (vercel link) into this site's aft env vault.
Skips VERCEL_*, TURBO_*, NX_* unless --include-vercel.
Sets NEXT_PUBLIC_APP_URL to https://<slug>.aft.page when missing.

Requires: aft login, vercel CLI (vercel login), linked .vercel/ in project root.`);
      return;
    default:
      throw new Error(`Unknown migrate target: ${target}\nRun: aft migrate --help`);
  }
}

async function cmdMigrateVercel(args) {
  await requireLogin();
  const { cwd, slug } = await resolveProject();
  const environment = flagValue(args, "--environment") || "production";
  const dryRun = hasFlag(args, "--dry-run");
  const includeVercel = hasFlag(args, "--include-vercel");

  if (!vercelOnPath()) {
    throw new Error("vercel CLI not found. Install: npm i -g vercel && vercel login");
  }

  say(`Pulling Vercel ${environment} env…`);
  const raw = pullVercelEnv(cwd, environment);
  const parsed = parseDotEnv(raw);
  let pairs = filterMigrateKeys(Object.entries(parsed), { includeVercel });

  const appUrl = liveSiteUrl(slug);
  if (!pairs.some(([k]) => k === "NEXT_PUBLIC_APP_URL")) {
    pairs.push(["NEXT_PUBLIC_APP_URL", appUrl]);
  } else {
    pairs = pairs.map(([k, v]) =>
      k === "NEXT_PUBLIC_APP_URL" ? [k, appUrl] : [k, v],
    );
  }
  pairs.sort((a, b) => a[0].localeCompare(b[0]));

  if (pairs.length === 0) {
    note("No env vars to migrate after filtering.");
    return;
  }

  if (dryRun) {
    say(`Would set ${pairs.length} secret(s) on ${slug}.aft.page:`);
    for (const [name] of pairs) console.log(`  ${name}`);
    return;
  }

  let synced = 0;
  for (const [name, value] of pairs) {
    const result = await putEnvSecret(slug, name, value, { quiet: true });
    if (result.synced) synced++;
    ok(`Set ${name}`);
  }
  note(
    `${pairs.length} secret(s) on ${slug}.aft.page` +
      (synced ? ` (${synced} synced via API)` : ""),
  );

  if (await hasWranglerConfig(cwd)) {
    say("Syncing to Worker (wrangler)…");
    const wr = pushWorkerSecrets(cwd, pairs);
    if (wr.ok) ok("Worker secrets updated");
    else note(`Worker sync skipped: ${wr.reason?.slice(0, 120) || "failed"}`);
  } else {
    note("Redeploy if the app still errors: aft deploy");
  }
}
