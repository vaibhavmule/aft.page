/** Claim + editToken flows. */
import { describe, it, expect } from "vitest";
import { env } from "cloudflare:test";
import { hashEditToken, timingSafeEqual, verifyEditToken } from "../src/auth";
import {
  API_ORIGIN,
  call,
  deployPaste,
  pasteHtml,
  fetchSite,
} from "./helpers";

function claimStart(slug: string, email: string, editToken: string): Request {
  return new Request(`${API_ORIGIN}/v1/claim/start`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "https://aft.page",
    },
    body: JSON.stringify({ slug, email, editToken }),
  });
}

function patchDeploy(
  slug: string,
  html: string,
  editToken: string,
): Request {
  return new Request(`${API_ORIGIN}/v1/deploy?slug=${encodeURIComponent(slug)}`, {
    method: "PATCH",
    headers: {
      "content-type": "text/html; charset=utf-8",
      "x-aft-edit-token": editToken,
    },
    body: html,
  });
}

describe("timing-safe compares", () => {
  it("timingSafeEqual matches equal strings only", () => {
    expect(timingSafeEqual("abc", "abc")).toBe(true);
    expect(timingSafeEqual("abc", "abd")).toBe(false);
    expect(timingSafeEqual("abc", "ab")).toBe(false);
  });

  it("verifyEditToken accepts the real token and rejects a wrong one", async () => {
    const stored = await hashEditToken(env, "safe-slug", "aft_edit_real");
    expect(await verifyEditToken(env, "safe-slug", "aft_edit_real", stored)).toBe(true);
    expect(await verifyEditToken(env, "safe-slug", "aft_edit_wrong", stored)).toBe(false);
  });
});

describe("editToken on deploy", () => {
  it("does not issue editToken when already signed in", async () => {
    const { createSession, findOrCreateUser } = await import("../src/auth");
    const user = await findOrCreateUser(env, "owned-deploy@example.com");
    const session = await createSession(env, user.id);
    const res = await call(
      new Request(`${API_ORIGIN}/v1/deploy?slug=owned-deploy`, {
        method: "POST",
        headers: {
          "content-type": "text/html; charset=utf-8",
          cookie: `aft_session=${session.token}`,
          origin: "https://aft.page",
        },
        body: "<h1>mine</h1>",
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { owned?: boolean; editToken?: string };
    expect(body.owned).toBe(true);
    expect(body.editToken).toBeUndefined();
  });

  it("returns editToken on successful deploy", async () => {
    const res = await call(pasteHtml("<h1>Token</h1>", "token-test"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      editToken?: string;
      slug: string;
      url: string;
      preview: string;
      claimUrl?: string;
      owned?: boolean;
    };
    expect(body.editToken).toMatch(/^aft_edit_/);
    expect(body.slug).toBe("token-test");
    expect(body.preview).toBe(
      `${body.url}/?token=${encodeURIComponent(body.editToken!)}`,
    );
    expect(body.preview).not.toContain("/preview");
    expect(body.claimUrl).toBe(
      `https://aft.page/claim?slug=${body.slug}&token=${encodeURIComponent(body.editToken!)}`,
    );
    expect(body.owned).toBe(false);
  });
});

describe("claim/start", () => {
  it("rejects without editToken", async () => {
    const out = await deployPaste("<h1>Claim</h1>", "claim-no-token");
    const res = await call(
      claimStart(out.slug, "user@example.com", "wrong-token"),
    );
    expect(res.status).toBe(401);
  });

  it("rejects missing fields", async () => {
    const res = await call(
      new Request(`${API_ORIGIN}/v1/claim/start`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ slug: "x" }),
      }),
    );
    expect(res.status).toBe(400);
  });

  it("accepts valid editToken (email may fail without EMAIL binding in test)", async () => {
    const res = await call(pasteHtml("<h1>Claim ok</h1>", "claim-ok"));
    const body = (await res.json()) as { slug: string; editToken: string };
    const start = await call(
      claimStart(body.slug, "owner@example.com", body.editToken),
    );
    // With EMAIL binding: 200. Without: 503 email_failed.
    expect([200, 503]).toContain(start.status);
    if (start.status === 200) {
      const data = (await start.json()) as { ok: boolean };
      expect(data.ok).toBe(true);
    }
  });
});

describe("PATCH redeploy", () => {
  it("updates same slug with editToken", async () => {
    const res = await call(pasteHtml("<h1>v1</h1>", "patch-v1"));
    const body = (await res.json()) as { slug: string; editToken: string };
    const patch = await call(patchDeploy(body.slug, "<h1>v2</h1>", body.editToken));
    expect(patch.status).toBe(200);

    const site = await fetchSite(body.slug);
    expect(await site.text()).toBe("<h1>v2</h1>");
  });

  it("rejects patch without auth", async () => {
    await deployPaste("<h1>v1</h1>", "patch-auth");
    const patch = await call(
      new Request(`${API_ORIGIN}/v1/deploy?slug=patch-auth`, {
        method: "PATCH",
        headers: { "content-type": "text/html; charset=utf-8" },
        body: "<h1>nope</h1>",
      }),
    );
    expect(patch.status).toBe(401);
  });
});

describe("GET /v1/sites/{slug}", () => {
  it("404s for unknown slug", async () => {
    const res = await call(
      new Request(`${API_ORIGIN}/v1/sites/no-such-site-zzzz`, {
        headers: { origin: "https://aft.page" },
      }),
    );
    expect(res.status).toBe(404);
  });

  it("reports unowned site", async () => {
    await deployPaste("<h1>info</h1>", "site-info");
    const res = await call(
      new Request(`${API_ORIGIN}/v1/sites/site-info`, {
        headers: { origin: "https://aft.page" },
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      owned: boolean;
      owner: boolean;
      visibility: string;
      url: string;
      manage: string;
      views7d: number;
    };
    expect(body.views7d).toBe(0);
    expect(body.owned).toBe(false);
    expect(body.owner).toBe(false);
    expect(body.visibility).toBe("public");
    expect(body.url).toBe("https://site-info.aft.page");
    expect(body.manage).toContain("/project/?slug=site-info");
    expect(res.headers.get("cache-control")).toMatch(/no-store/i);
  });

  it("reports owner when session matches", async () => {
    const { createSession, findOrCreateUser, assignSiteOwner } = await import(
      "../src/auth"
    );
    const site = await deployPaste("<h1>mine</h1>", "site-owner-info");
    const user = await findOrCreateUser(env, "owner-info@example.com");
    await assignSiteOwner(env, site.slug, user.id);
    const session = await createSession(env, user.id);
    const res = await call(
      new Request(`${API_ORIGIN}/v1/sites/${site.slug}`, {
        headers: {
          origin: "https://aft.page",
          cookie: `aft_session=${session.token}`,
        },
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      owned: boolean;
      owner: boolean;
      email: string;
    };
    expect(body.owned).toBe(true);
    expect(body.owner).toBe(true);
    expect(body.email).toBe("owner-info@example.com");
  });
});

describe("POST /v1/claim/session", () => {
  it("claims unowned site for logged-in user with editToken", async () => {
    const { createSession, findOrCreateUser } = await import("../src/auth");
    const { getSiteOwnerId } = await import("../src/db");
    const site = await deployPaste("<h1>sess claim</h1>", "sess-claim");
    const user = await findOrCreateUser(env, "sess-claim@example.com");
    const session = await createSession(env, user.id);
    const res = await call(
      new Request(`${API_ORIGIN}/v1/claim/session`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "https://aft.page",
          cookie: `aft_session=${session.token}`,
        },
        body: JSON.stringify({ slug: site.slug, editToken: site.editToken }),
      }),
    );
    expect(res.status).toBe(200);
    expect(await getSiteOwnerId(env, site.slug)).toBe(user.id);
  });
});

describe("claim/verify", () => {
  it("rejects invalid magic token", async () => {
    const res = await call(
      new Request(
        `${API_ORIGIN}/v1/claim/verify?token=aft_magic_bad&slug=verify-bad`,
      ),
    );
    expect(res.status).toBe(400);
  });

  it("lands on the live slug after a valid magic link", async () => {
    const { createMagicLink } = await import("../src/auth");
    const site = await deployPaste("<h1>verify live</h1>", "verify-live");
    const { token } = await createMagicLink(
      env,
      site.slug,
      "verify-live@example.com",
    );
    const res = await call(
      new Request(
        `${API_ORIGIN}/v1/claim/verify?token=${encodeURIComponent(token)}&slug=${site.slug}`,
        { redirect: "manual" },
      ),
    );
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(
      `https://${site.slug}.aft.page/?claimed=1`,
    );
    expect(res.headers.get("set-cookie") || "").toContain("aft_session=");
  });
});
