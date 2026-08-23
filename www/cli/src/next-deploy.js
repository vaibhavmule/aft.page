/** Next.js SSR: OpenNext build → wrangler → mapping site on aft.page. */
import { spawnSync } from "node:child_process";
import { access, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { apiFetch, readJson } from "./api.js";
import { say } from "./ui.js";

function run(cmd, args, cwd) {
  const r = spawnSync(cmd, args, {
    cwd,
    stdio: "inherit",
    shell: process.platform === "win32",
    env: process.env,
  });
  if (r.status !== 0) {
    throw new Error(`${cmd} ${args.join(" ")} failed (exit ${r.status ?? "?"})`);
  }
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export async function deployNextSsr(
  projectRoot,
  slug,
  { editToken } = {},
) {
  say("Build: OpenNext…");
  if (!(await exists(join(projectRoot, "node_modules")))) {
    run("npm", ["install", "--legacy-peer-deps"], projectRoot);
  }
  run(
    "npm",
    [
      "install",
      "--save-dev",
      "@opennextjs/cloudflare",
      "wrangler",
      "--legacy-peer-deps",
    ],
    projectRoot,
  );

  const wranglerPath = join(projectRoot, "wrangler.jsonc");
  let name = `aft-u-${slug}`;
  if (await exists(wranglerPath)) {
    const raw = await readFile(wranglerPath, "utf8");
    const m = raw.match(/"name"\s*:\s*"([^"]+)"/);
    if (m) name = m[1];
  } else {
    const date = new Date().toISOString().slice(0, 10);
    await writeFile(
      wranglerPath,
      `${JSON.stringify(
        {
          name,
          main: ".open-next/worker.js",
          compatibility_date: date,
          compatibility_flags: ["nodejs_compat", "global_fetch_strictly_public"],
          assets: { directory: ".open-next/assets", binding: "ASSETS" },
        },
        null,
        2,
      )}\n`,
    );
  }

  run("npx", ["opennextjs-cloudflare", "build"], projectRoot);
  if (!(await exists(join(projectRoot, ".open-next/worker.js")))) {
    throw new Error("OpenNext produced no .open-next/worker.js.");
  }

  say(`Deploy Worker ${name}…`);
  const wr = spawnSync("npx", ["wrangler", "deploy", "--name", name], {
    cwd: projectRoot,
    encoding: "utf8",
    shell: process.platform === "win32",
    env: process.env,
  });
  if (wr.stdout) process.stdout.write(wr.stdout);
  if (wr.stderr) process.stderr.write(wr.stderr);
  if (wr.status !== 0) {
    throw new Error(
      "wrangler deploy failed. Log in with wrangler / set CLOUDFLARE_API_TOKEN.",
    );
  }
  const found = `${wr.stdout || ""}\n${wr.stderr || ""}`.match(
    /https:\/\/[a-z0-9.-]+\.workers\.dev/,
  );
  if (!found) throw new Error("wrangler deploy did not print a workers.dev URL.");
  const upstream = new URL(found[0]).origin;

  say("Deploy URL…");
  const headers = {};
  if (editToken) headers["x-aft-edit-token"] = editToken;
  const res = await apiFetch(`/v1/deploy?slug=${encodeURIComponent(slug)}`, {
    method: editToken ? "PATCH" : "POST",
    headers,
    json: {
      files: [
        {
          path: "index.html",
          content: `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><title>${slug}</title></head><body><p>Next.js on aft.page</p></body></html>`,
        },
        {
          path: "aft.json",
          content: JSON.stringify({ name: slug, runtime: "next", upstream }),
        },
      ],
    },
  });
  const body = await readJson(res);
  if (!res.ok || !body.url) {
    throw new Error(body.hint || body.message || body.error || "mapping deploy failed");
  }
  return body;
}
