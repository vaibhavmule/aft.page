#!/usr/bin/env node
/**
 * Live hosted-CLI time-to-URL benchmark.
 *
 * Creates real public test deployments. Test slugs begin with `test--`, which
 * keeps them out of the product dashboards and exempts them from anonymous GC.
 */
import { access, cp, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "../..");
const cli = join(repo, "apps/cli/bin/aft.js");
const runId = new Date().toISOString().replace(/\D/g, "").slice(2, 14);
const cases = ["html", "vite", "vue", "svelte", "astro", "next-static", "next"];
const selected = new Set(valueAfter("--case")?.split(",") || cases);
const timeoutMs = Number(valueAfter("--timeout-ms") || 60_000);
const jsonOnly = process.argv.includes("--json");

for (const name of selected) {
  if (!cases.includes(name)) {
    fail(`unknown case '${name}' (expected ${cases.join(",")})`);
  }
}

const work = await mkdtemp(join(tmpdir(), "aft-t2u-"));
const results = [];

if (selected.has("html")) {
  const dir = join(work, "html");
  await mkdir(dir);
  await writeFile(
    join(dir, "index.html"),
    "<!doctype html><title>aft T2U HTML</title><h1>aft-t2u-html</h1>\n",
  );
  results.push(await benchmark("html", dir, "aft-t2u-html"));
}

if (selected.has("vite")) {
  const source = join(repo, "examples/vite-hello");
  const buildStarted = performance.now();
  await command("npm", ["run", "build"], { cwd: source });
  const buildMs = performance.now() - buildStarted;
  const dir = join(work, "vite");
  await cp(join(source, "dist"), dir, { recursive: true });
  // The readiness probe fetches HTML (it does not execute the React bundle).
  results.push(await benchmark("vite", dir, '<div id="root"></div>', buildMs));
}

for (const fixture of [
  { name: "vue", output: "dist", marker: '<div id="app"></div>' },
  { name: "svelte", output: "dist", marker: '<div id="app"></div>' },
  { name: "astro", output: "dist", marker: "aft-t2u-astro" },
  { name: "next-static", output: "out", marker: "aft-t2u-next-static" },
]) {
  if (selected.has(fixture.name)) {
    results.push(await buildAndBenchmark(fixture));
  }
}

if (selected.has("next")) {
  // The hosted CLI registers the Next runtime; OpenNext/Wrangler owns the
  // upstream build and deploy. Use AFT_T2U_NEXT_UPSTREAM to test another Worker.
  const example = join(repo, "examples/next-hello");
  const manifest = JSON.parse(await readFile(join(example, "aft.json"), "utf8"));
  manifest.name = `test--t2u-next-${runId}`;
  manifest.slug = manifest.name;
  manifest.upstream = process.env.AFT_T2U_NEXT_UPSTREAM || manifest.upstream;
  if (!manifest.upstream) fail("next case needs AFT_T2U_NEXT_UPSTREAM");

  const dir = join(work, "next");
  await mkdir(dir);
  await cp(join(example, "index.html"), join(dir, "index.html"));
  await writeFile(join(dir, "aft.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  results.push(await benchmark("next", dir, null));
}

if (jsonOnly) {
  console.log(JSON.stringify({ runId, results }, null, 2));
} else {
  console.log("\nTime to URL (milliseconds)");
  console.table(
    results.map(({ name, buildMs, deployMs, readyMs, totalMs, status, url }) => ({
      case: name,
      build: Math.round(buildMs),
      "CLI → URL": Math.round(deployMs),
      "CLI → ready": Math.round(readyMs),
      total: Math.round(totalMs),
      status,
      url,
    })),
  );
}

async function benchmark(name, dir, marker, buildMs = 0) {
  const slug = `test--t2u-${name}-${runId}`;
  const started = performance.now();
  const output = await command(process.execPath, [cli, "deploy", ".", "--slug", slug], {
    cwd: dir,
    capture: true,
  });
  const deployMs = performance.now() - started;
  const url = output.stdout.split(/\s+/).find((part) => /^https:\/\//.test(part));
  if (!url) fail(`${name}: CLI did not print a URL\n${output.stderr}`);
  const ready = await waitUntilReady(url, marker, started);
  return {
    name,
    buildMs: round(buildMs),
    deployMs: round(deployMs),
    readyMs: round(ready.elapsedMs),
    totalMs: round(buildMs + ready.elapsedMs),
    status: ready.status,
    attempts: ready.attempts,
    url,
  };
}

async function buildAndBenchmark({ name, output, marker }) {
  const source = join(here, "fixtures", name);
  if (!(await exists(join(source, "node_modules")))) {
    if (!jsonOnly) console.log(`\nInstalling ${name} fixture dependencies (not timed)…`);
    await command("npm", ["install", "--no-audit", "--no-fund"], { cwd: source });
  }
  const buildStarted = performance.now();
  await command("npm", ["run", "build"], { cwd: source });
  const buildMs = performance.now() - buildStarted;
  const dir = join(work, name);
  await cp(join(source, output), dir, { recursive: true });
  return benchmark(name, dir, marker, buildMs);
}

async function waitUntilReady(url, marker, started) {
  let attempts = 0;
  let last = "no response";
  while (performance.now() - started < timeoutMs) {
    attempts++;
    try {
      const res = await fetch(`${url}/?aft_t2u=${Date.now()}`, {
        redirect: "follow",
        signal: AbortSignal.timeout(10_000),
      });
      const body = await res.text();
      last = `HTTP ${res.status}`;
      if (res.ok && (!marker || body.includes(marker))) {
        return { elapsedMs: performance.now() - started, status: res.status, attempts };
      }
      if (res.ok && marker) last += ` without marker '${marker}'`;
    } catch (error) {
      last = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 500));
  }
  fail(`URL not ready after ${timeoutMs}ms: ${url} (${last})`);
}

function command(bin, args, { cwd, capture = false } = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(bin, args, {
      cwd,
      env: process.env,
      stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit",
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk) => (stdout += chunk));
    child.stderr?.on("data", (chunk) => (stderr += chunk));
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolvePromise({ stdout, stderr });
      else reject(new Error(`${bin} ${args.join(" ")} exited ${code}\n${stderr}`));
    });
  });
}

function valueAfter(flag) {
  const index = process.argv.indexOf(flag);
  return index === -1 ? undefined : process.argv[index + 1];
}

function round(value) {
  return Math.round(value * 10) / 10;
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
