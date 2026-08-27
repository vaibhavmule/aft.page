/** Next.js SSR: build → ship Worker → map slug on aft.page. Internals stay out of UI. */
import { access, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { apiFetch, readJson } from "./api.js";
import { runCmd, runStep } from "./ui.js";
import { cmpVersion } from "./version.js";

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function installedNextVersion(root) {
  try {
    const raw = await readFile(join(root, "node_modules/next/package.json"), "utf8");
    return JSON.parse(raw).version || "";
  } catch {
    return "";
  }
}

/** Next 14 dropped Q1 2026. 15.x < 15.5.24 and 16.x < 16.3.3 are known-vulnerable. */
export function nextVersionUnsupported(ver) {
  const m = String(ver).match(/^(\d+)/);
  if (!m) return true;
  const major = Number(m[1]);
  if (major < 15) return true;
  if (major === 15) return cmpVersion(ver, "15.5.24") < 0;
  if (major === 16) return cmpVersion(ver, "16.3.3") < 0;
  return false;
}

export async function deployNextSsr(
  projectRoot,
  slug,
  { editToken, verbose = false } = {},
) {
  await runStep("Installing dependencies…", async () => {
    if (!(await exists(join(projectRoot, "node_modules")))) {
      runCmd("npm", ["install", "--legacy-peer-deps"], projectRoot, {
        verbose,
        failMessage: "Install failed",
      });
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
      { verbose, failMessage: "Install failed" },
    );
    const nextVer = await installedNextVersion(projectRoot);
    if (nextVersionUnsupported(nextVer)) {
      throw new Error(
        `Next.js ${nextVer || "unknown"} is not supported. Use Next 15.5.24+ or 16.3.3+.`,
      );
    }
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

  const openNextNames = ["open-next.config.ts", "open-next.config.js", "open-next.config.mjs", "open-next.config.mts"];
  if (!(await Promise.all(openNextNames.map((n) => exists(join(projectRoot, n))))).some(Boolean)) {
    await writeFile(
      join(projectRoot, "open-next.config.ts"),
      `import { defineCloudflareConfig } from "@opennextjs/cloudflare";
import staticAssetsIncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/static-assets-incremental-cache";

export default defineCloudflareConfig({
  incrementalCache: staticAssetsIncrementalCache,
  enableCacheInterception: true,
});
`,
    );
  }

  await runStep("Building…", async () => {
    runCmd("npx", ["opennextjs-cloudflare", "build"], projectRoot, {
      verbose,
      failMessage: "Build failed",
    });
    if (!(await exists(join(projectRoot, ".open-next/worker.js")))) {
      throw new Error("Build failed — no output.");
    }
  }, { verbose });

  const wr = await runStep("Deploying…", async () =>
    runCmd("npx", ["wrangler", "deploy", "--name", name], projectRoot, {
      verbose,
      failMessage: "Deploy failed",
    }), { verbose });

  const found = `${wr.stdout || ""}\n${wr.stderr || ""}`.match(
    /https:\/\/[a-z0-9.-]+\.workers\.dev/,
  );
  if (!found) throw new Error("Deploy failed — no live URL returned.");
  const upstream = new URL(found[0]).origin;

  const headers = {};
  if (editToken) headers["x-aft-edit-token"] = editToken;
  const body = await runStep("Publishing…", async () => {
    const res = await apiFetch(`/v1/deploy?slug=${encodeURIComponent(slug)}`, {
      method: editToken ? "PATCH" : "POST",
      headers,
      json: {
        files: [
          {
            path: "index.html",
            content: `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><title>${slug}</title></head><body><p>${slug}.aft.page</p></body></html>`,
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
        parsed.hint || parsed.message || parsed.error || "Publish failed",
      );
    }
    return parsed;
  }, { verbose });

  return body;
}
