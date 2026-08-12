/** Rename slug after deploy (editToken) or after claim (owner). */
import { describe, it, expect } from "vitest";
import { env } from "cloudflare:test";
import {
  assignSiteOwner,
  createSession,
  findOrCreateUser,
} from "../src/auth";
import { API_ORIGIN, call, deployPaste, fetchSite } from "./helpers";

async function ownSite(slug: string, email: string): Promise<string> {
  const user = await findOrCreateUser(env, email);
  expect(await assignSiteOwner(env, slug, user.id)).toBe(true);
  const session = await createSession(env, user.id);
  return `aft_session=${session.token}`;
}

describe("POST /v1/sites/{slug}/rename", () => {
  it("renames with edit token before claim", async () => {
    const first = await deployPaste("<h1>rename-me</h1>", "rename-before");
    expect(first.editToken).toBeTruthy();

    const res = await call(
      new Request(`${API_ORIGIN}/v1/sites/${first.slug}/rename`, {
        method: "POST",
        headers: {
          origin: "https://aft.page",
          "content-type": "application/json",
          "x-aft-edit-token": first.editToken!,
        },
        body: JSON.stringify({ slug: "rename-after" }),
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      slug: string;
      previousSlug: string;
      url: string;
    };
    expect(body.slug).toBe("rename-after");
    expect(body.previousSlug).toBe("rename-before");
    expect(body.url).toBe("https://rename-after.aft.page");

    expect(await (await fetchSite("rename-after")).text()).toContain(
      "rename-me",
    );
    expect((await fetchSite("rename-before")).status).toBe(404);
  });

  it("renames with owner session after claim", async () => {
    const site = await deployPaste("<h1>owned-rename</h1>", "owned-old");
    const cookie = await ownSite(site.slug, "owner-rename@example.com");

    const res = await call(
      new Request(`${API_ORIGIN}/v1/sites/${site.slug}/rename`, {
        method: "POST",
        headers: {
          origin: "https://aft.page",
          "content-type": "application/json",
          cookie,
        },
        body: JSON.stringify({ slug: "owned-new" }),
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { slug: string };
    expect(body.slug).toBe("owned-new");
    expect(await (await fetchSite("owned-new")).text()).toContain(
      "owned-rename",
    );
  });

  it("rejects taken and reserved slugs", async () => {
    const a = await deployPaste("<h1>a</h1>", "rename-taken-a");
    await deployPaste("<h1>b</h1>", "rename-taken-b");

    const taken = await call(
      new Request(`${API_ORIGIN}/v1/sites/${a.slug}/rename`, {
        method: "POST",
        headers: {
          origin: "https://aft.page",
          "content-type": "application/json",
          "x-aft-edit-token": a.editToken!,
        },
        body: JSON.stringify({ slug: "rename-taken-b" }),
      }),
    );
    expect(taken.status).toBe(409);

    const reserved = await call(
      new Request(`${API_ORIGIN}/v1/sites/${a.slug}/rename`, {
        method: "POST",
        headers: {
          origin: "https://aft.page",
          "content-type": "application/json",
          "x-aft-edit-token": a.editToken!,
        },
        body: JSON.stringify({ slug: "www" }),
      }),
    );
    expect(reserved.status).toBe(400);
  });

  it("rejects strangers", async () => {
    const site = await deployPaste("<h1>nope</h1>", "rename-deny");
    const res = await call(
      new Request(`${API_ORIGIN}/v1/sites/${site.slug}/rename`, {
        method: "POST",
        headers: {
          origin: "https://aft.page",
          "content-type": "application/json",
        },
        body: JSON.stringify({ slug: "stolen" }),
      }),
    );
    expect(res.status).toBe(401);
  });
});
