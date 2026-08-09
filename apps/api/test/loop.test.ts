/** One product loop: deploy → claim → private → invite view/edit → redeploy → rollback. */
import { describe, it, expect } from "vitest";
import { env } from "cloudflare:test";
import {
  assignSiteOwner,
  createSession,
  findOrCreateUser,
  randomToken,
  sha256Hex,
} from "../src/auth";
import { createSiteInvite } from "../src/db";
import { API_ORIGIN, call, deployPaste, fetchSite } from "./helpers";

async function acceptInvite(token: string): Promise<string> {
  const accept = await call(
    new Request(
      `${API_ORIGIN}/v1/invites/accept?token=${encodeURIComponent(token)}`,
      { redirect: "manual" },
    ),
  );
  expect(accept.status).toBe(302);
  const setCookie = accept.headers.get("set-cookie") || "";
  const cookie = setCookie.split(";")[0] || "";
  expect(cookie).toContain("aft_session=");
  return cookie;
}

describe("product loop", () => {
  it("deploy → claim → private → invite viewer/editor → redeploy → rollback", async () => {
    const first = await deployPaste("<h1>v1 license</h1>", "loop-license");

    const claim = await call(
      new Request(`${API_ORIGIN}/v1/claim/start`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "https://aft.page",
        },
        body: JSON.stringify({
          slug: first.slug,
          email: "owner-loop@example.com",
          editToken: first.editToken,
        }),
      }),
    );
    expect([200, 503]).toContain(claim.status);

    const owner = await findOrCreateUser(env, "owner-loop@example.com");
    expect(await assignSiteOwner(env, first.slug, owner.id)).toBe(true);
    const ownerSession = await createSession(env, owner.id);
    const ownerCookie = `aft_session=${ownerSession.token}`;

    const vis = await call(
      new Request(`${API_ORIGIN}/v1/sites/${first.slug}`, {
        method: "PATCH",
        headers: {
          origin: "https://aft.page",
          "content-type": "application/json",
          cookie: ownerCookie,
        },
        body: JSON.stringify({ visibility: "private" }),
      }),
    );
    expect(vis.status).toBe(200);
    expect(((await vis.json()) as { visibility: string }).visibility).toBe("private");

    const stranger = await fetchSite(first.slug);
    expect(stranger.status).toBe(302);

    const viewToken = randomToken("aft_inv_");
    await createSiteInvite(env, {
      id: crypto.randomUUID().replace(/-/g, ""),
      slug: first.slug,
      email: "viewer-loop@example.com",
      role: "view",
      tokenHash: await sha256Hex(`${env.AUTH_SECRET}:invite:${viewToken}`),
      invitedBy: owner.id,
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
    });
    const viewerCookie = await acceptInvite(viewToken);
    const viewerSite = await call(
      new Request(`https://${first.slug}.aft.page/`, {
        headers: { cookie: viewerCookie },
      }),
    );
    expect(viewerSite.status).toBe(200);
    expect(await viewerSite.text()).toBe("<h1>v1 license</h1>");

    const editToken = randomToken("aft_inv_");
    await createSiteInvite(env, {
      id: crypto.randomUUID().replace(/-/g, ""),
      slug: first.slug,
      email: "editor-loop@example.com",
      role: "edit",
      tokenHash: await sha256Hex(`${env.AUTH_SECRET}:invite:${editToken}`),
      invitedBy: owner.id,
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
    });
    const editorCookie = await acceptInvite(editToken);

    const redeploy = await call(
      new Request(`${API_ORIGIN}/v1/deploy?slug=${first.slug}`, {
        method: "PATCH",
        headers: {
          origin: "https://aft.page",
          "content-type": "text/html; charset=utf-8",
          cookie: editorCookie,
        },
        body: "<h1>v2 license</h1>",
      }),
    );
    expect(redeploy.status).toBe(200);

    const afterRedeploy = await call(
      new Request(`https://${first.slug}.aft.page/`, {
        headers: { cookie: viewerCookie },
      }),
    );
    expect(await afterRedeploy.text()).toBe("<h1>v2 license</h1>");

    const rb = await call(
      new Request(`${API_ORIGIN}/v1/sites/${first.slug}/rollback`, {
        method: "POST",
        headers: {
          cookie: ownerCookie,
          origin: "https://aft.page",
          "content-type": "application/json",
        },
        body: JSON.stringify({ deployId: first.deployId }),
      }),
    );
    expect(rb.status).toBe(200);

    const afterRollback = await call(
      new Request(`https://${first.slug}.aft.page/`, {
        headers: { cookie: viewerCookie },
      }),
    );
    expect(afterRollback.status).toBe(200);
    expect(await afterRollback.text()).toBe("<h1>v1 license</h1>");
  });
});
