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
    expect(site.status).toBe(302);
    expect(site.headers.get("location") || "").toContain(
      "https://aft.page/login?next=",
    );
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
    expect(denied.status).toBe(302);
    expect(denied.headers.get("location")).toBe(
      `https://aft.page/login?next=${encodeURIComponent(`https://${slug}.aft.page/`)}`,
    );

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

describe("private access gate", () => {
  it("anonymous visitors redirect to login with next", async () => {
    const { slug } = await deployPaste("<h1>gate</h1>", "priv-gate");
    await ownSite(slug, "owner-gate@example.com");
    await setSiteVisibility(env, slug, "private");
    const res = await fetchSite(slug);
    expect(res.status).toBe(302);
    const loc = res.headers.get("location") || "";
    expect(loc.startsWith("https://aft.page/login?next=")).toBe(true);
    expect(decodeURIComponent(new URL(loc).searchParams.get("next") || "")).toBe(
      `https://${slug}.aft.page/`,
    );
  });

  it("logged-in stranger sees branded deny HTML", async () => {
    const { slug } = await deployPaste("<h1>gate2</h1>", "priv-gate2");
    await ownSite(slug, "owner-gate2@example.com");
    await setSiteVisibility(env, slug, "private");
    const strangerCookie = await sessionCookieFor("stranger-gate@example.com");
    const res = await call(
      new Request(`https://${slug}.aft.page/`, {
        headers: { cookie: strangerCookie },
      }),
    );
    expect(res.status).toBe(401);
    const html = await res.text();
    expect(html).toContain("This site is private");
    expect(html).toContain('class="brand"');
    expect(html).toContain("aft<span>.</span>page");
    expect(html).toContain('id="email"');
    expect(html).toContain("/access");
  });

  it("POST access returns check_your_email for any valid email", async () => {
    const { slug } = await deployPaste("<h1>access</h1>", "priv-access");
    await ownSite(slug, "owner-access@example.com");
    await setSiteVisibility(env, slug, "private");
    const res = await call(
      new Request(`${API_ORIGIN}/v1/sites/${slug}/access`, {
        method: "POST",
        headers: {
          origin: `https://${slug}.aft.page`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ email: "stranger@example.com" }),
      }),
    );
    expect([200, 503]).toContain(res.status);
    if (res.status === 200) {
      const body = (await res.json()) as { message: string };
      expect(body.message).toBe("check_your_email");
    }
  });

  it("owner can change a member from view to edit", async () => {
    const { slug } = await deployPaste("<h1>role</h1>", "priv-role");
    const { cookie } = await ownSite(slug, "owner-role@example.com");
    const pal = await findOrCreateUser(env, "vaibhavmule135@example.com");
    await upsertSiteMember(env, slug, pal.id, pal.email, "view");

    const patch = await call(
      new Request(`${API_ORIGIN}/v1/sites/${slug}/members/${pal.id}`, {
        method: "PATCH",
        headers: {
          origin: "https://aft.page",
          "content-type": "application/json",
          cookie,
        },
        body: JSON.stringify({ role: "edit" }),
      }),
    );
    expect(patch.status).toBe(200);
    expect(await patch.json()).toMatchObject({
      member: { userId: pal.id, role: "edit" },
    });
  });

  it("OPTIONS allows DELETE", async () => {
    const res = await call(
      new Request(`${API_ORIGIN}/v1/sites/x/invites/y`, {
        method: "OPTIONS",
        headers: { origin: "https://aft.page" },
      }),
    );
    expect(res.status).toBe(204);
    const allow = res.headers.get("access-control-allow-methods") || "";
    expect(allow).toMatch(/DELETE/i);
  });
});
