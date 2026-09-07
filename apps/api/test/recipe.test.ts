/** The deploy recipe: one artifact for agent-written, repo-derived, or declared. */
import { describe, it, expect } from "vitest";
import { env } from "cloudflare:test";
import {
  parseRecipe,
  recipeCacheKey,
  readCachedRecipe,
  writeCachedRecipe,
  shouldCacheRecipe,
  type DeployRecipe,
} from "../src/recipe";

const flask: DeployRecipe = {
  stack: "flask",
  port: 5000,
  start: "flask run --host 0.0.0.0 --port 5000",
  install: "pip install -r requirements.txt",
  root: "",
  source: "declared",
  ref: "v2.1.0",
};

describe("recipe parsing", () => {
  it("accepts a recipe an agent declared alongside the app", () => {
    const r = parseRecipe(flask);
    expect(r).toMatchObject({
      stack: "flask",
      port: 5000,
      start: "flask run --host 0.0.0.0 --port 5000",
      source: "declared",
      ref: "v2.1.0",
    });
  });

  it("accepts the same recipe as JSON text", () => {
    expect(parseRecipe(JSON.stringify(flask))?.port).toBe(5000);
  });

  it("rejects a recipe that cannot start anything", () => {
    // A model or a bad aft.json can produce these; half-applying them is worse
    // than refusing, because the failure surfaces at run time instead of now.
    expect(parseRecipe({ ...flask, start: "" })).toBeNull();
    expect(parseRecipe({ ...flask, port: 0 })).toBeNull();
    expect(parseRecipe({ ...flask, port: 70000 })).toBeNull();
    expect(parseRecipe({ ...flask, port: "abc" })).toBeNull();
    expect(parseRecipe("not json")).toBeNull();
    expect(parseRecipe(null)).toBeNull();
    expect(parseRecipe([1, 2, 3])).toBeNull();
  });

  it("defaults an unknown source to detected rather than trusting it", () => {
    expect(parseRecipe({ ...flask, source: "whatever" })?.source).toBe("detected");
  });

  it("drops env keys that are not valid shell identifiers", () => {
    const r = parseRecipe({
      ...flask,
      env: { GOOD_ONE: "yes", "bad-key": "no", ALSO_GOOD: "yes", NUMERIC: 5 },
    });
    expect(Object.keys(r?.env || {}).sort()).toEqual(["ALSO_GOOD", "GOOD_ONE"]);
  });

  it("normalizes root so the same subdir maps to one cache entry", () => {
    expect(parseRecipe({ ...flask, root: "/Apps/Web/" })?.root).toBe("apps/web");
  });
});

describe("recipe cache", () => {
  it("keys on the commit, not the tag, and normalizes owner/repo/root", () => {
    const a = recipeCacheKey("Owner", "Repo", "ABC123", "/Sub/");
    const b = recipeCacheKey("owner", "repo", "abc123", "sub");
    expect(a).toBe(b);
    expect(a).toContain("recipe:");
    // Tags move; a commit is the only thing that pins what was detected.
    expect(a).toContain("abc123");
  });

  it("round-trips so the second deploy of a repo skips detection", async () => {
    await writeCachedRecipe(env, "acme", "poster", "deadbeef", "", {
      ...flask,
      source: "generated",
    });
    const hit = await readCachedRecipe(env, "acme", "poster", "deadbeef", "");
    expect(hit).toMatchObject({ stack: "flask", port: 5000, source: "generated" });

    // A different commit of the same repo is a different recipe.
    expect(await readCachedRecipe(env, "acme", "poster", "cafe0000", "")).toBeNull();
  });

  it("never caches a recipe that could not start the app", async () => {
    expect(shouldCacheRecipe({ ...flask, start: "" })).toBe(false);
    await writeCachedRecipe(env, "acme", "broken", "sha1", "", {
      ...flask,
      start: "",
    });
    expect(await readCachedRecipe(env, "acme", "broken", "sha1", "")).toBeNull();
  });

  it("carries a Dockerfile through unchanged — that is what makes it portable", async () => {
    const dockerfile = "FROM python:3.12-slim\nWORKDIR /app\nCOPY . .\nCMD [\"flask\", \"run\"]";
    await writeCachedRecipe(env, "acme", "df", "sha2", "", { ...flask, dockerfile });
    const hit = await readCachedRecipe(env, "acme", "df", "sha2", "");
    expect(hit?.dockerfile).toBe(dockerfile);
  });
});
