/** ~/.config/aft.page/cli.json — analytics + update prefs. */
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";

export function prefsPath() {
  return (
    process.env.AFT_CLI_PREFS ||
    join(homedir(), ".config", "aft.page", "cli.json")
  );
}

/**
 * @returns {Promise<{
 *   analytics?: boolean|null,
 *   updateCheck?: boolean|null,
 *   lastCheckAt?: string,
 *   lastNotifiedVersion?: string
 * }>}
 */
export async function loadPrefs() {
  try {
    const data = JSON.parse(await readFile(prefsPath(), "utf8"));
    return data && typeof data === "object" ? data : {};
  } catch {
    return {};
  }
}

export async function savePrefs(patch) {
  const cur = await loadPrefs();
  const next = { ...cur, ...patch };
  const path = prefsPath();
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 });
  return next;
}
