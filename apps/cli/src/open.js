/** aft open — open this project's live URL (requires login). */
import { exec } from "node:child_process";
import { requireLogin, resolveProject } from "./project.js";
import { ok } from "./ui.js";

function openBrowser(url) {
  const cmd =
    process.platform === "darwin"
      ? `open ${JSON.stringify(url)}`
      : process.platform === "win32"
        ? `start "" ${JSON.stringify(url)}`
        : `xdg-open ${JSON.stringify(url)}`;
  exec(cmd, () => {});
}

export async function cmdOpen() {
  await requireLogin();
  const { slug } = await resolveProject();
  const url = `https://${slug}.aft.page`;
  openBrowser(url);
  ok(url);
  console.log(url);
}
