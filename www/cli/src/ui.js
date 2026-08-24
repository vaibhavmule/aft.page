/** Terminal styling — no deps, quiet when not a TTY. */
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const outTty = process.stdout.isTTY;
const errTty = process.stderr.isTTY;

function wrap(enabled, code, s) {
  return enabled ? `\x1b[${code}m${s}\x1b[0m` : s;
}

export const ui = {
  bold: (s) => wrap(outTty, "1", s),
  dim: (s) => wrap(outTty, "2", s),
  green: (s) => wrap(outTty, "32", s),
  cyan: (s) => wrap(outTty, "36", s),
  yellow: (s) => wrap(outTty, "33", s),
  red: (s) => wrap(outTty, "31", s),
  ebold: (s) => wrap(errTty, "1", s),
  edim: (s) => wrap(errTty, "2", s),
  egreen: (s) => wrap(errTty, "32", s),
  eyellow: (s) => wrap(errTty, "33", s),
  ered: (s) => wrap(errTty, "31", s),
};

export function say(msg) {
  console.error(msg);
}

export function ok(msg) {
  console.error(`${ui.egreen("✓")} ${msg}`);
}

export function fail(msg) {
  console.error(`${ui.ered("✗")} ${msg}`);
}

export function note(msg) {
  console.error(ui.edim(msg));
}

export function formatDuration(ms) {
  const sec = Math.max(1, Math.round(ms / 1000));
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return s ? `${m}m ${s}s` : `${m}m`;
}

export function isVerbose(args = []) {
  return (
    args.includes("--verbose") ||
    args.includes("-v") ||
    process.env.AFT_VERBOSE === "1"
  );
}

export function stripVerboseFlags(args) {
  return args.filter((a) => a !== "--verbose" && a !== "-v");
}

function quietNpmEnv(verbose) {
  if (verbose) return process.env;
  return {
    ...process.env,
    npm_config_loglevel: "error",
    npm_config_audit: "false",
    npm_config_fund: "false",
  };
}

const TAIL_LINES = 40;

function tailText(text, lines = TAIL_LINES) {
  const parts = String(text || "")
    .split(/\r?\n/)
    .filter((l) => l.trim());
  if (parts.length <= lines) return parts.join("\n");
  return parts.slice(-lines).join("\n");
}

function dumpFailureLog(label, stdout, stderr) {
  const combined = `${stdout || ""}\n${stderr || ""}`.trim();
  if (!combined) return;
  say(tailText(combined));
  try {
    const dir = mkdtempSync(join(tmpdir(), "aft-cli-"));
    const path = join(dir, "deploy.log");
    writeFileSync(path, combined);
    note(`Full log: ${path}`);
  } catch {
    /* best effort */
  }
}

/** Run a subprocess; quiet by default (pipe + tail on failure). */
export function runCmd(cmd, args, cwd, { verbose = false } = {}) {
  const npmArgs =
    cmd === "npm" && !verbose
      ? [...args, "--loglevel=error", "--no-audit", "--no-fund"]
      : args;
  const r = spawnSync(cmd, npmArgs, {
    cwd,
    stdio: verbose ? "inherit" : "pipe",
    shell: process.platform === "win32",
    env: quietNpmEnv(verbose),
    encoding: verbose ? undefined : "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (r.status !== 0) {
    if (!verbose) {
      dumpFailureLog(
        `${cmd} ${args.join(" ")}`,
        r.stdout,
        r.stderr,
      );
    }
    throw new Error(`${cmd} ${args.join(" ")} failed (exit ${r.status ?? "?"})`);
  }
  return {
    stdout: verbose ? "" : String(r.stdout || ""),
    stderr: verbose ? "" : String(r.stderr || ""),
  };
}

const SPIN = ["◐", "◓", "◑", "◒"];

/** One deploy phase: spinner when TTY, plain ✓ line when quiet. */
export async function runStep(label, fn, { verbose = false } = {}) {
  const start = Date.now();
  const doneLabel = label.replace(/…+$/, "");

  if (verbose) {
    say(label);
    return await fn();
  }

  if (!errTty) {
    say(label);
    const result = await fn();
    ok(`${doneLabel} (${formatDuration(Date.now() - start)})`);
    return result;
  }

  let frame = 0;
  process.stderr.write(`\r${SPIN[0]} ${label}`);
  const timer = setInterval(() => {
    frame = (frame + 1) % SPIN.length;
    process.stderr.write(`\r${SPIN[frame]} ${label}`);
  }, 90);

  try {
    return await fn();
  } finally {
    clearInterval(timer);
    const elapsed = ui.edim(`(${formatDuration(Date.now() - start)})`);
    process.stderr.write(`\r${ui.egreen("✓")} ${doneLabel} ${elapsed}\n`);
  }
}
