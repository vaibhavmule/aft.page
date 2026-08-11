/** ~/.config/aft.page/credentials.json */
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { mkdir, readFile, writeFile, unlink } from "node:fs/promises";

export function credentialsPath() {
  return (
    process.env.AFT_CREDENTIALS ||
    join(homedir(), ".config", "aft.page", "credentials.json")
  );
}

export async function loadCredentials() {
  try {
    const raw = await readFile(credentialsPath(), "utf8");
    const data = JSON.parse(raw);
    if (data && typeof data.token === "string" && data.token) return data;
  } catch {
    /* missing */
  }
  return null;
}

export async function saveCredentials(creds) {
  const path = credentialsPath();
  await mkdir(dirname(path), { recursive: true });
  await writeFile(
    path,
    JSON.stringify(
      {
        token: creds.token,
        email: creds.email || undefined,
        expiresAt: creds.expiresAt || undefined,
      },
      null,
      2,
    ) + "\n",
    { mode: 0o600 },
  );
}

export async function clearCredentials() {
  try {
    await unlink(credentialsPath());
  } catch {
    /* ok */
  }
}
