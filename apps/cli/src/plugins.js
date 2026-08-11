/** Install the aft.page Agent Plugin. */
import { spawn } from "node:child_process";

export async function cmdPlugins(args) {
  const sub = args[0];
  if (sub !== "add") {
    console.error("Usage: aft plugins add");
    process.exitCode = 1;
    return;
  }
  const code = await new Promise((resolve) => {
    const child = spawn(
      "npx",
      ["--yes", "plugins", "add", "vaibhavmule/aft.page"],
      { stdio: "inherit", shell: process.platform === "win32" },
    );
    child.on("close", (c) => resolve(c ?? 1));
    child.on("error", () => resolve(1));
  });
  if (code !== 0) process.exitCode = code;
}
