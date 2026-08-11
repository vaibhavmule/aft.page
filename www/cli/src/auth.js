/** Browser login (Wrangler-style loopback) + whoami / logout. */
import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import { exec } from "node:child_process";
import { apiBase, apiFetch, readJson } from "./api.js";
import {
  clearCredentials,
  loadCredentials,
  saveCredentials,
} from "./creds.js";

function openBrowser(url) {
  const cmd =
    process.platform === "darwin"
      ? `open ${JSON.stringify(url)}`
      : process.platform === "win32"
        ? `start "" ${JSON.stringify(url)}`
        : `xdg-open ${JSON.stringify(url)}`;
  exec(cmd, () => {});
}

function randomState() {
  return randomBytes(16).toString("base64url");
}

export async function cmdLogin() {
  const state = randomState();

  const code = await new Promise((resolve, reject) => {
    let settled = false;
    let timer;
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn(value);
    };

    const server = createServer((req, res) => {
      try {
        const u = new URL(req.url || "/", "http://127.0.0.1");
        if (u.pathname !== "/callback") {
          res.writeHead(404);
          res.end("not found");
          return;
        }
        const gotState = u.searchParams.get("state") || "";
        const gotCode = u.searchParams.get("code") || "";
        if (gotState !== state || !gotCode) {
          res.writeHead(400, { "content-type": "text/html; charset=utf-8" });
          res.end("<p>Login failed (bad state). You can close this tab.</p>");
          server.close();
          finish(reject, new Error("login callback missing code or state"));
          return;
        }
        res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        res.end(
          "<p>Logged in. You can close this tab and return to the terminal.</p>",
        );
        server.close();
        finish(resolve, gotCode);
      } catch (err) {
        server.close();
        finish(reject, err);
      }
    });

    timer = setTimeout(() => {
      server.close();
      finish(reject, new Error("login timed out (10 minutes)"));
    }, 10 * 60 * 1000);

    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      const url = `${apiBase()}/v1/auth/cli?port=${port}&state=${encodeURIComponent(state)}`;
      console.error("Opening browser for aft.page login…");
      console.error(url);
      openBrowser(url);
    });
    server.on("error", (err) => finish(reject, err));
  });

  const res = await apiFetch("/v1/auth/cli/exchange", {
    method: "POST",
    json: { code, state },
    token: null,
  });
  const body = await readJson(res);
  if (!res.ok || !body.token) {
    throw new Error(
      body.hint || body.error || `exchange failed (${res.status})`,
    );
  }
  await saveCredentials({
    token: body.token,
    email: body.email,
    expiresAt: body.expiresAt,
  });
  console.log(`Logged in as ${body.email || "unknown"}`);
}

export async function cmdLogout() {
  await clearCredentials();
  console.log("Logged out.");
}

export async function cmdWhoami() {
  const creds = await loadCredentials();
  if (!creds?.token && !process.env.AFT_TOKEN) {
    console.error("Not logged in. Run: aft login");
    process.exitCode = 1;
    return;
  }
  const res = await apiFetch("/v1/me");
  const body = await readJson(res);
  if (!res.ok) {
    console.error(body.error || `unauthorized (${res.status})`);
    process.exitCode = 1;
    return;
  }
  console.log(body.email || body.id);
}
