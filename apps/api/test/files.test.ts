/** Hub Source tab: list + preview deploy files. Not a public route. */
import { describe, it, expect } from "vitest";
import { env } from "cloudflare:test";
import {
  assignSiteOwner,
  createSession,
  findOrCreateUser,
} from "../src/auth";
import { upsertSiteMember } from "../src/db";
import { API_ORIGIN, call, fetchSite, uploadJson } from "./helpers";

async function sessionCookie(email: string): Promise<string> {
  const user = await findOrCreateUser(env, email);
  const session = await createSession(env, user.id);
  return `aft_session=${session.token}`;
}

async function ownSite(slug: string, email: string): Promise<string> {
  const user = await findOrCreateUser(env, email);
  expect(await assignSiteOwner(env, slug, user.id)).toBe(true);
  const session = await createSession(env, user.id);
  return `aft_session=${session.token}`;
}

describe("GET /v1/sites/{slug}/files", () => {
  it("lists current deploy files and previews text for owner and viewer", async () => {
    const deployed = await call(
      uploadJson(
        [
          { path: "index.html", content: "<h1>hi</h1>" },
          { path: "README.md", content: "# Notes\nhello" },
          { path: "blob.bin", content: "a\u0000b" },
        ],
        "src-hub",
      ),
    );
    expect(deployed.status).toBe(200);
    const { slug, deployId } = (await deployed.json()) as {
      slug: string;
      deployId: string;
    };
    const cookie = await ownSite(slug, "src-owner@example.com");

    const liveReadme = await fetchSite(slug, "/README.md");
    expect(liveReadme.status).toBe(200);

    const list = await call(
      new Request(`${API_ORIGIN}/v1/sites/${slug}/files`, {
        headers: { cookie, origin: "https://aft.page" },
      }),
    );
    expect(list.status).toBe(200);
    const listed = (await list.json()) as {
      deployId: string;
      files: { path: string; bytes: number }[];
    };
    expect(listed.deployId).toBe(deployId);
    expect(listed.files.map((f) => f.path)).toEqual([
      "blob.bin",
      "index.html",
      "README.md",
    ]);

    const preview = await call(
      new Request(
        `${API_ORIGIN}/v1/sites/${slug}/files?path=${encodeURIComponent("README.md")}`,
        { headers: { cookie, origin: "https://aft.page" } },
      ),
    );
    expect(preview.status).toBe(200);
    const body = (await preview.json()) as {
      path: string;
      text?: string;
      binary?: boolean;
    };
    expect(body.path).toBe("README.md");
    expect(body.text).toBe("# Notes\nhello");
    expect(body.binary).toBeUndefined();

    const bin = await call(
      new Request(`${API_ORIGIN}/v1/sites/${slug}/files?path=blob.bin`, {
        headers: { cookie, origin: "https://aft.page" },
      }),
    );
    expect(bin.status).toBe(200);
    const binBody = (await bin.json()) as { binary?: boolean; text?: string };
    expect(binBody.binary).toBe(true);
    expect(binBody.text).toBeUndefined();

    const viewer = await findOrCreateUser(env, "src-view@example.com");
    await upsertSiteMember(env, slug, viewer.id, viewer.email, "view");
    const viewCookie = await sessionCookie("src-view@example.com");
    const viewList = await call(
      new Request(`${API_ORIGIN}/v1/sites/${slug}/files`, {
        headers: { cookie: viewCookie, origin: "https://aft.page" },
      }),
    );
    expect(viewList.status).toBe(200);
  });

  it("rejects strangers and path escape", async () => {
    await call(
      uploadJson([{ path: "index.html", content: "<h1>x</h1>" }], "src-secret"),
    );
    const anon = await call(
      new Request(`${API_ORIGIN}/v1/sites/src-secret/files`, {
        headers: { origin: "https://aft.page" },
      }),
    );
    expect(anon.status).toBe(401);

    const stranger = await sessionCookie("src-stranger@example.com");
    const forbidden = await call(
      new Request(`${API_ORIGIN}/v1/sites/src-secret/files`, {
        headers: { cookie: stranger, origin: "https://aft.page" },
      }),
    );
    expect(forbidden.status).toBe(403);

    const cookie = await ownSite("src-secret", "src-secret-owner@example.com");
    const escape = await call(
      new Request(
        `${API_ORIGIN}/v1/sites/src-secret/files?path=${encodeURIComponent("../other")}`,
        { headers: { cookie, origin: "https://aft.page" } },
      ),
    );
    expect(escape.status).toBe(400);
  });
});
