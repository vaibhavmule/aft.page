/** Next.js SSR: OpenNext build → wrangler → mapping site on aft.page. */
import { access, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { apiFetch, readJson } from "./api.js";
import { runCmd, runStep } from "./ui.js";

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
  { editToken, verbose = false } = {},
) {
  await runStep("Installing dependencies…", async () => {
    if (!(await exists(join(projectRoot, "node_modules")))) {
      runCmd("npm", ["install", "--legacy-peer-deps"], projectRoot, { verbose });
    }
    runCmd(
      "npm",
      [
        "install",
        "--save-dev",
        "@opennextjs/cloudflare",
        "wrangler",
        "--legacy-peer-deps",
      ],
      projectRoot,
      { verbose },
    );
  }, { verbose });

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

  await runStep("Building…", async () => {
    runCmd("npx", ["opennextjs-cloudflare", "build"], projectRoot, { verbose });
    if (!(await exists(join(projectRoot, ".open-next/worker.js")))) {
      throw new Error("OpenNext produced no .open-next/worker.js.");
    }
  }, { verbose });

  const wr = await runStep(`Deploying Worker ${name}…`, async () =>
    runCmd("npx", ["wrangler", "deploy", "--name", name], projectRoot, {
      verbose,
    }), { verbose });

  const found = `${wr.stdout || ""}\n${wr.stderr || ""}`.match(
    /https:\/\/[a-z0-9.-]+\.workers\.dev/,
  );
  if (!found) throw new Error("wrangler deploy did not print a workers.dev URL.");
  const upstream = new URL(found[0]).origin;

  const headers = {};
  if (editToken) headers["x-aft-edit-token"] = editToken;
  const body = await runStep(`Mapping ${slug}.aft.page…`, async () => {
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
    const parsed = await readJson(res);
    if (!res.ok || !parsed.url) {
      throw new Error(
        parsed.hint || parsed.message || parsed.error || "mapping deploy failed",
      );
    }
    return parsed;
  }, { verbose });

  return body;
}
