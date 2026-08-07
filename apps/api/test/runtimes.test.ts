import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import {
  deleteSiteSecret,
  getSiteSecretsMap,
  listSiteSecretNames,
  putSiteSecret,
} from "../src/secrets";
import { extractAftManifest } from "../src/manifest";
import { upsertSiteRow, setSiteRuntime, getSiteRow } from "../src/db";

describe("site secrets vault", () => {
  it("encrypts, lists names only, decrypts map, deletes", async () => {
    await upsertSiteRow(env, "secret-site", "dep_test", null);
    await putSiteSecret(env, "secret-site", "ANTHROPIC_API_KEY", "sk-test-123");
    expect(await listSiteSecretNames(env, "secret-site")).toEqual([
      "ANTHROPIC_API_KEY",
    ]);
    const map = await getSiteSecretsMap(env, "secret-site");
    expect(map.ANTHROPIC_API_KEY).toBe("sk-test-123");
    expect(await deleteSiteSecret(env, "secret-site", "ANTHROPIC_API_KEY")).toBe(
      true,
    );
    expect(await listSiteSecretNames(env, "secret-site")).toEqual([]);
  });
});

describe("aft.json manifest", () => {
  it("parses lattice-js runtime", () => {
    const files = [
      {
        path: "aft.json",
        contentType: "application/json",
        bytes: new TextEncoder().encode(
          JSON.stringify({
            runtime: "lattice-js",
            capabilities: { secrets: ["ANTHROPIC_API_KEY"] },
          }),
        ).buffer,
      },
    ];
    const m = extractAftManifest(files);
    expect(m?.runtime).toBe("lattice-js");
  });
});

describe("site runtime row", () => {
  it("persists runtime and upstream", async () => {
    await upsertSiteRow(env, "rt-site", "dep_rt", null);
    await setSiteRuntime(env, "rt-site", {
      runtime: "worker",
      upstreamUrl: "https://example.workers.dev",
      mainModule: "worker.js",
    });
    const row = await getSiteRow(env, "rt-site");
    expect(row?.runtime).toBe("worker");
    expect(row?.upstreamUrl).toBe("https://example.workers.dev");
    expect(row?.mainModule).toBe("worker.js");
  });
});
