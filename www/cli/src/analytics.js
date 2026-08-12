/** Opt-in anonymous usage analytics + silent update checks. */
import { apiBase } from "./api.js";
import { confirm, isInteractive } from "./prompt.js";
import { loadPrefs, savePrefs } from "./prefs.js";
import { note, ok, say, ui } from "./ui.js";
import { localVersion } from "./version.js";

/** Ask once (TTY): anonymous usage analytics. Updates are always on. */
export async function ensureAnalyticsConsent() {
  if (process.env.AFT_NO_ANALYTICS === "1") {
    await savePrefs({ analytics: false });
    return false;
  }
  const prefs = await loadPrefs();
  if (typeof prefs.analytics === "boolean") return prefs.analytics;

  if (!isInteractive()) return false;

  say("");
  say(
    `${ui.bold("Analytics:")} share anonymous CLI usage (command + version) to improve aft.`,
  );
  note("No email. Logged-in actions already identify you on the server.");
  const yes = await confirm("Share anonymous usage analytics?", {
    defaultYes: true,
  });
  await savePrefs({ analytics: yes });
  if (yes) note("Thanks. Change later: aft update --disable-analytics");
  else note("No analytics. Change later: aft update --enable-analytics");
  return yes;
}

/** Fire-and-forget POST /v1/cli/event when opted in. */
export async function maybeTrackCommand(cmd) {
  if (!cmd || process.env.AFT_NO_ANALYTICS === "1") return;
  const prefs = await loadPrefs();
  if (prefs.analytics !== true) return;

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 2000);
  try {
    await fetch(`${apiBase()}/v1/cli/event`, {
      method: "POST",
      signal: ctrl.signal,
      headers: {
        "content-type": "application/json",
        "x-aft-client": "cli",
        "x-aft-cli-version": localVersion(),
      },
      body: JSON.stringify({ cmd: String(cmd), version: localVersion() }),
    });
  } catch {
    /* never block the CLI */
  } finally {
    clearTimeout(t);
  }
}

export async function setAnalytics(enabled) {
  await savePrefs({ analytics: Boolean(enabled) });
  ok(enabled ? "Anonymous analytics enabled" : "Anonymous analytics disabled");
}
