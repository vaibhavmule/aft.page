/** Version check (on by default) + aft update. */
import { spawnSync } from "node:child_process";
import { setAnalytics } from "./analytics.js";
import { confirm, isInteractive } from "./prompt.js";
import { loadPrefs, savePrefs } from "./prefs.js";
import { note, ok, say, ui } from "./ui.js";
import { cmpVersion, localVersion } from "./version.js";

export const DEFAULT_CLI_BASE = "https://aft.page/cli";
const CHECK_TTL_MS = 24 * 60 * 60 * 1000;

export function cliBase() {
  return (process.env.AFT_CLI_BASE || DEFAULT_CLI_BASE).replace(/\/$/, "");
}

export function installUrl() {
  return process.env.AFT_INSTALL_URL || "https://aft.page/install";
}

async function fetchRemoteVersion() {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 2500);
  try {
    const res = await fetch(`${cliBase()}/VERSION`, {
      signal: ctrl.signal,
      headers: { "x-aft-client": "cli", "x-aft-cli-version": localVersion() },
    });
    if (!res.ok) return null;
    const text = (await res.text()).trim();
    return text || null;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

function updateChecksEnabled(prefs) {
  if (process.env.AFT_NO_UPDATE === "1") return false;
  // Default on — only off when explicitly disabled.
  return prefs.updateCheck !== false;
}

/**
 * Soft check. Never throws. May prompt to update when outdated + TTY.
 * @returns {Promise<{ remote: string|null, outdated: boolean }>}
 */
export async function maybeCheckUpdates({ force = false } = {}) {
  const prefs = await loadPrefs();
  if (!force && !updateChecksEnabled(prefs)) {
    return { remote: null, outdated: false };
  }

  if (!force && prefs.lastCheckAt) {
    const age = Date.now() - Date.parse(prefs.lastCheckAt);
    if (Number.isFinite(age) && age < CHECK_TTL_MS) {
      return { remote: null, outdated: false };
    }
  }

  const remote = await fetchRemoteVersion();
  await savePrefs({ lastCheckAt: new Date().toISOString() });
  if (!remote) return { remote: null, outdated: false };

  const local = localVersion();
  const outdated = cmpVersion(local, remote) < 0;
  if (!outdated) return { remote, outdated: false };

  if (prefs.lastNotifiedVersion === remote && !force) {
    note(`CLI ${local} is behind ${remote} — run: aft update`);
    return { remote, outdated: true };
  }

  say("");
  say(
    `${ui.yellow("!")} CLI update available: ${ui.bold(local)} → ${ui.bold(remote)}`,
  );
  await savePrefs({ lastNotifiedVersion: remote });

  if (isInteractive()) {
    const go = await confirm("Update now?", { defaultYes: true });
    if (go) {
      await cmdUpdate([]);
      return { remote, outdated: true };
    }
    note("Later: aft update");
  } else {
    note("Run: aft update");
  }
  return { remote, outdated: true };
}

export async function cmdUpdate(args) {
  if (args.includes("--enable-analytics")) {
    await setAnalytics(true);
    return;
  }
  if (args.includes("--disable-analytics")) {
    await setAnalytics(false);
    return;
  }
  if (args.includes("--enable-check")) {
    await savePrefs({ updateCheck: true });
    ok("Update checks enabled");
    return;
  }
  if (args.includes("--disable-check")) {
    await savePrefs({ updateCheck: false });
    ok("Update checks disabled");
    return;
  }

  const url = installUrl();
  say(`Updating via ${url}…`);
  const r = spawnSync("sh", ["-c", `curl -fsSL ${JSON.stringify(url)} | sh`], {
    stdio: "inherit",
    env: process.env,
  });
  if (r.status !== 0) {
    throw new Error(`update failed (exit ${r.status ?? "?"})`);
  }
  ok(`Updated — local ${localVersion()} (restart shell if PATH was new)`);
}
