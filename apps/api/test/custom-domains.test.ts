/** Custom hostnames: add, serve, delete. */
import { describe, it, expect } from "vitest";
import { env } from "cloudflare:test";
import {
  assignSiteOwner,
  createSession,
  findOrCreateUser,
} from "../src/auth";
import { parseHostname } from "../src/custom-domains";
import { API_ORIGIN, call, deployPaste } from "./helpers";

async function ownSite(
  slug: string,
  email: string,
  access: "approved" | "none" = "approved",
): Promise<string> {
  const user = await findOrCreateUser(env, email);
  expect(await assignSiteOwner(env, slug, user.id)).toBe(true);
  if (access === "approved") {
    await env.DB.prepare(
      `UPDATE users SET custom_domains = 'approved' WHERE id = ?`,
    )
      .bind(user.id)
      .run();
  }
  const session = await createSession(env, user.id);
  return `aft_session=${session.token}`;
}

describe("parseHostname", () => {
  it("accepts a real hostname and strips a URL", () => {
    expect(parseHostname("App.Example.com")).toBe("app.example.com");
    expect(parseHostname("https://www.shop.io/path")).toBe("www.shop.io");
  });

  it("rejects aft.page hosts and junk", () => {
    expect(parseHostname("demo.aft.page")).toBeNull();
    expect(parseHostname("aft.page")).toBeNull();
    expect(parseHostname("nope")).toBeNull();
    expect(parseHostname("")).toBeNull();
  });
});

describe("custom domain endpoints", () => {
  it("gates add until ops approves the owner", async () => {
    const { slug } = await deployPaste("<h1>Gate</h1>", "vanity-gate");
    const cookie = await ownSite(slug, "gated@example.com", "none");

    const blocked = await call(
      new Request(`${API_ORIGIN}/v1/sites/${slug}/domains`, {
        method: "POST",
        headers: {
          cookie,
          origin: "https://aft.page",
          "content-type": "application/json",
        },
        body: JSON.stringify({ hostname: "gated.example.com" }),
      }),
    );
    expect(blocked.status).toBe(403);

    const ask = await call(
      new Request(`${API_ORIGIN}/v1/sites/${slug}/domains/access`, {
        method: "POST",
        headers: { cookie, origin: "https://aft.page" },
      }),
    );
    expect(ask.status).toBe(200);
    expect(await ask.json()).toMatchObject({ access: "requested" });

    const still = await call(
      new Request(`${API_ORIGIN}/v1/sites/${slug}/domains`, {
        method: "POST",
        headers: {
          cookie,
          origin: "https://aft.page",
          "content-type": "application/json",
        },
        body: JSON.stringify({ hostname: "gated.example.com" }),
      }),
    );
    expect(still.status).toBe(403);

    const listed = await call(
      new Request(`${API_ORIGIN}/v1/sites/${slug}/domains`, {
        headers: { cookie, origin: "https://aft.page" },
      }),
    );
    expect(listed.status).toBe(200);
    expect(await listed.json()).toMatchObject({ access: "requested", domains: [] });
  });

  it("owner adds a hostname and the site serves on it", async () => {
    const { slug } = await deployPaste("<h1>Vanity</h1>", "vanity-serve");
    const cookie = await ownSite(slug, "vanity@example.com");

    const add = await call(
      new Request(`${API_ORIGIN}/v1/sites/${slug}/domains`, {
        method: "POST",
        headers: {
          cookie,
          origin: "https://aft.page",
          "content-type": "application/json",
        },
        body: JSON.stringify({ hostname: "app.vanity.test" }),
      }),
    );
    expect(add.status).toBe(200);
    const added = (await add.json()) as {
      domain: { hostname: string; status: string; cname: string };
    };
    expect(added.domain.hostname).toBe("app.vanity.test");
    expect(added.domain.status).toBe("pending");
    expect(added.domain.cname).toBe("cname.aft.page");

    const hit = await call(new Request("https://app.vanity.test/"));
    expect(hit.status).toBe(200);
    expect(await hit.text()).toBe("<h1>Vanity</h1>");
    expect(hit.headers.get("x-aft-slug")).toBe(slug);
  });

  it("requires the owner and rejects *.aft.page", async () => {
    const { slug } = await deployPaste("<h1>No</h1>", "vanity-auth");
    const anon = await call(
      new Request(`${API_ORIGIN}/v1/sites/${slug}/domains`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ hostname: "ok.example.com" }),
      }),
    );
    expect(anon.status).toBe(401);

    const cookie = await ownSite(slug, "vanity-auth@example.com");
    const bad = await call(
      new Request(`${API_ORIGIN}/v1/sites/${slug}/domains`, {
        method: "POST",
        headers: {
          cookie,
          origin: "https://aft.page",
          "content-type": "application/json",
        },
        body: JSON.stringify({ hostname: "stolen.aft.page" }),
      }),
    );
    expect(bad.status).toBe(400);
  });

  it("does not let a second site steal a hostname", async () => {
    const a = await deployPaste("<h1>A</h1>", "vanity-a");
    const b = await deployPaste("<h1>B</h1>", "vanity-b");
    const cookieA = await ownSite(a.slug, "a@example.com");
    const cookieB = await ownSite(b.slug, "b@example.com");

    const first = await call(
      new Request(`${API_ORIGIN}/v1/sites/${a.slug}/domains`, {
        method: "POST",
        headers: {
          cookie: cookieA,
          origin: "https://aft.page",
          "content-type": "application/json",
        },
        body: JSON.stringify({ hostname: "taken.example.com" }),
      }),
    );
    expect(first.status).toBe(200);

    const steal = await call(
      new Request(`${API_ORIGIN}/v1/sites/${b.slug}/domains`, {
        method: "POST",
        headers: {
          cookie: cookieB,
          origin: "https://aft.page",
          "content-type": "application/json",
        },
        body: JSON.stringify({ hostname: "taken.example.com" }),
      }),
    );
    expect(steal.status).toBe(409);
  });

  it("delete stops serving the custom host", async () => {
    const { slug } = await deployPaste("<h1>Bye</h1>", "vanity-del");
    const cookie = await ownSite(slug, "del@example.com");
    await call(
      new Request(`${API_ORIGIN}/v1/sites/${slug}/domains`, {
        method: "POST",
        headers: {
          cookie,
          origin: "https://aft.page",
          "content-type": "application/json",
        },
        body: JSON.stringify({ hostname: "gone.example.com" }),
      }),
    );

    const del = await call(
      new Request(
        `${API_ORIGIN}/v1/sites/${slug}/domains/${encodeURIComponent("gone.example.com")}`,
        {
          method: "DELETE",
          headers: { cookie, origin: "https://aft.page" },
        },
      ),
    );
    expect(del.status).toBe(200);

    const hit = await call(new Request("https://gone.example.com/"));
    expect(hit.status).toBe(404);
    expect(await hit.json()).toMatchObject({ error: "unknown_host" });
  });

  it("still 404s unknown foreign hosts", async () => {
    const res = await call(new Request("https://evil.example.com/"));
    expect(res.status).toBe(404);
  });
});
