/** Deploy history, rollback, capabilities. */
import { describe, it, expect } from "vitest";
import { env } from "cloudflare:test";
import {
  assignSiteOwner,
  createSession,
  findOrCreateUser,
} from "../src/auth";
import { API_ORIGIN, call, deployPaste, uploadJson } from "./helpers";

async function ownSite(slug: string, email: string): Promise<string> {
  const user = await findOrCreateUser(env, email);
  expect(await assignSiteOwner(env, slug, user.id)).toBe(true);
  const session = await createSession(env, user.id);
  return `aft_session=${session.token}`;
}

describe("deploy history", () => {
  it("records deploys and lists them for owner", async () => {
    const first = await deployPaste("<h1>v1</h1>", "hist-v1");
    const cookie = await ownSite(first.slug, "hist@example.com");

    const patch = await call(
      new Request(`${API_ORIGIN}/v1/deploy?slug=${first.slug}`, {
        method: "PATCH",
        headers: {
          "content-type": "text/html; charset=utf-8",
          "x-aft-edit-token": first.editToken,
        },
        body: "<h1>v2</h1>",
      }),
    );
    expect(patch.status).toBe(200);
    const patched = (await patch.json()) as { deployId: string };

    const list = await call(
      new Request(`${API_ORIGIN}/v1/sites/${first.slug}/deploys`, {
        headers: { cookie, origin: "https://aft.page" },
      }),
    );
    expect(list.status).toBe(200);
    const body = (await list.json()) as {
      currentDeployId: string;
      deploys: { id: string }[];
    };
    expect(body.currentDeployId).toBe(patched.deployId);
    expect(body.deploys.length).toBeGreaterThanOrEqual(2);
  });

  it("rolls back to a prior deployId", async () => {
    const first = await deployPaste("<h1>old</h1>", "hist-rb");
    const cookie = await ownSite(first.slug, "rb@example.com");
    const patch = await call(
      new Request(`${API_ORIGIN}/v1/deploy?slug=${first.slug}`, {
        method: "PATCH",
        headers: {
          "content-type": "text/html; charset=utf-8",
          "x-aft-edit-token": first.editToken,
        },
        body: "<h1>new</h1>",
      }),
    );
    expect(patch.status).toBe(200);

    const rb = await call(
      new Request(`${API_ORIGIN}/v1/sites/${first.slug}/rollback`, {
        method: "POST",
        headers: {
          cookie,
          origin: "https://aft.page",
          "content-type": "application/json",
        },
        body: JSON.stringify({ deployId: first.deployId }),
      }),
    );
    expect(rb.status).toBe(200);

    const site = await call(new Request(`https://${first.slug}.aft.page/`));
    expect(await site.text()).toBe("<h1>old</h1>");
  });
});

describe("capabilities", () => {
  it("returns pending capabilities when aft.json present", async () => {
    const res = await call(
      uploadJson(
        [
          {
            path: "index.html",
            content: "<h1>caps</h1>",
          },
          {
            path: "aft.json",
            content: JSON.stringify({
              capabilities: {
                secrets: ["slack-webhook"],
                egress: ["hooks.slack.com"],
                data: ["expenses:read"],
              },
            }),
          },
        ],
        "caps-pending",
      ),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      slug: string;
      capabilities?: { status: string; summary: string[] };
    };
    expect(body.capabilities?.status).toBe("pending");
    expect(body.capabilities?.summary?.length).toBeGreaterThan(0);

    const cookie = await ownSite(body.slug, "caps@example.com");
    const approve = await call(
      new Request(`${API_ORIGIN}/v1/sites/${body.slug}/capabilities`, {
        method: "POST",
        headers: {
          cookie,
          origin: "https://aft.page",
          "content-type": "application/json",
        },
        body: "{}",
      }),
    );
    expect(approve.status).toBe(200);
    const approved = (await approve.json()) as {
      capabilities: { status: string };
    };
    expect(approved.capabilities.status).toBe("approved");
  });
});

describe("projects", () => {
  it("lists owned sites with pagination metadata", async () => {
    const { slug } = await deployPaste("<h1>inv</h1>", "me-sites");
    const cookie = await ownSite(slug, "me@example.com");
    const res = await call(
      new Request(`${API_ORIGIN}/v1/me/sites?page=1&limit=10`, {
        headers: { cookie, origin: "https://aft.page" },
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      user: { email: string };
      sites: { slug: string }[];
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
    expect(body.user.email).toBe("me@example.com");
    expect(body.page).toBe(1);
    expect(body.limit).toBe(10);
    expect(body.total).toBeGreaterThanOrEqual(1);
    expect(body.totalPages).toBeGreaterThanOrEqual(1);
    expect(body.sites.some((s) => s.slug === slug)).toBe(true);
  });
});
