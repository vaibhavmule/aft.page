/** Private visibility + invite ACL. */
import { describe, it, expect } from "vitest";
import { env } from "cloudflare:test";
import {
  assignSiteOwner,
  createSession,
  findOrCreateUser,
  randomToken,
  sha256Hex,
} from "../src/auth";
import { createSiteInvite, setSiteVisibility, upsertSiteMember } from "../src/db";
import {
  API_ORIGIN,
  call,
  deployPaste,
  fetchSite,
} from "./helpers";

async function sessionCookieFor(email: string): Promise<string> {
  const user = await findOrCreateUser(env, email);
  const session = await createSession(env, user.id);
  return `aft_session=${session.token}`;
}

async function ownSite(slug: string, email: string): Promise<{ cookie: string; userId: string }> {
  const user = await findOrCreateUser(env, email);
  const ok = await assignSiteOwner(env, slug, user.id);
  expect(ok).toBe(true);
  const session = await createSession(env, user.id);
  return { cookie: `aft_session=${session.token}`, userId: user.id };
}

describe("private visibility", () => {
  it("GET site info returns real visibility", async () => {
    const { slug } = await deployPaste("<h1>vis</h1>", "vis-info");
    const { cookie } = await ownSite(slug, "owner-vis@example.com");
    await setSiteVisibility(env, slug, "private");

    const res = await call(
      new Request(`${API_ORIGIN}/v1/sites/${slug}`, {
        headers: { origin: "https://aft.page", cookie },
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      visibility: string;
      owner: boolean;
    };
    expect(body.visibility).toBe("private");
    expect(body.owner).toBe(true);
  });

  it("owner can PATCH visibility", async () => {
    const { slug } = await deployPaste("<h1>patch-vis</h1>", "patch-vis");
    const { cookie } = await ownSite(slug, "owner-patch@example.com");

    const res = await call(
      new Request(`${API_ORIGIN}/v1/sites/${slug}`, {
        method: "PATCH",
        headers: {
          origin: "https://aft.page",
          "content-type": "application/json",
          cookie,
        },
        body: JSON.stringify({ visibility: "private" }),
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { visibility: string };
    expect(body.visibility).toBe("private");
  });

  it("stranger cannot view private site", async () => {
    const { slug } = await deployPaste("<h1>secret</h1>", "priv-deny");
    const { cookie } = await ownSite(slug, "owner-deny@example.com");
    await call(
      new Request(`${API_ORIGIN}/v1/sites/${slug}`, {
        method: "PATCH",
        headers: {
          origin: "https://aft.page",
          "content-type": "application/json",
          cookie,
        },
        body: JSON.stringify({ visibility: "private" }),
      }),
    );

    const site = await fetchSite(slug);
    expect(site.status).toBe(401);
    expect(await site.text()).toContain("private");
  });

  it("owner can view private site with session cookie", async () => {
    const { slug } = await deployPaste("<h1>mine</h1>", "priv-owner");
    const { cookie } = await ownSite(slug, "owner-ok@example.com");
    await setSiteVisibility(env, slug, "private");

    const site = await call(
      new Request(`https://${slug}.aft.page/`, {
        headers: { cookie },
      }),
    );
    expect(site.status).toBe(200);
    expect(await site.text()).toBe("<h1>mine</h1>");
  });

  it("invited member can view private site", async () => {
    const { slug } = await deployPaste("<h1>shared</h1>", "priv-member");
    const { cookie: ownerCookie } = await ownSite(
      slug,
      "owner-mem@example.com",
    );
    await setSiteVisibility(env, slug, "private");

    const member = await findOrCreateUser(env, "member@example.com");
    await upsertSiteMember(env, slug, member.id, member.email, "view");
    const memberCookie = await sessionCookieFor("member@example.com");

    const denied = await fetchSite(slug);
    expect(denied.status).toBe(401);

    const allowed = await call(
      new Request(`https://${slug}.aft.page/`, {
        headers: { cookie: memberCookie },
      }),
    );
    expect(allowed.status).toBe(200);
    expect(await allowed.text()).toBe("<h1>shared</h1>");

    // owner still ok
    const ownerRes = await call(
      new Request(`https://${slug}.aft.page/`, {
        headers: { cookie: ownerCookie },
      }),
    );
    expect(ownerRes.status).toBe(200);
  });
});

describe("invites", () => {
  it("accept invite grants membership", async () => {
    const { slug } = await deployPaste("<h1>inv</h1>", "invite-accept");
    const { userId } = await ownSite(slug, "owner-inv@example.com");
    await setSiteVisibility(env, slug, "private");

    const token = randomToken("aft_inv_");
    const tokenHash = await sha256Hex(`${env.AUTH_SECRET}:invite:${token}`);
    const id = crypto.randomUUID().replace(/-/g, "");
    await createSiteInvite(env, {
      id,
      slug,
      email: "guest@example.com",
      role: "view",
      tokenHash,
      invitedBy: userId,
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
    });

    const accept = await call(
      new Request(
        `${API_ORIGIN}/v1/invites/accept?token=${encodeURIComponent(token)}`,
        { redirect: "manual" },
      ),
    );
    expect(accept.status).toBe(302);
    const setCookie = accept.headers.get("set-cookie") || "";
    expect(setCookie).toContain("aft_session=");

    const site = await call(
      new Request(`https://${slug}.aft.page/`, {
        headers: { cookie: setCookie.split(";")[0]! },
      }),
    );
    expect(site.status).toBe(200);
  });

  it("create invite requires owner session (email may 503)", async () => {
    const { slug } = await deployPaste("<h1>create-inv</h1>", "invite-create");
    const { cookie } = await ownSite(slug, "owner-create@example.com");

    const res = await call(
      new Request(`${API_ORIGIN}/v1/sites/${slug}/invites`, {
        method: "POST",
        headers: {
          origin: "https://aft.page",
          "content-type": "application/json",
          cookie,
        },
        body: JSON.stringify({ email: "pal@example.com", role: "view" }),
      }),
    );
    expect([200, 503]).toContain(res.status);
  });
});
