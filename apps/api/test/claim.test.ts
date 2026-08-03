/** Claim + editToken flows. */
import { describe, it, expect } from "vitest";
import { env } from "cloudflare:test";
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

describe("editToken on deploy", () => {
  it("returns editToken on successful deploy", async () => {
    const res = await call(pasteHtml("<h1>Token</h1>", "token-test"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { editToken?: string; slug: string };
    expect(body.editToken).toMatch(/^aft_edit_/);
    expect(body.slug).toBe("token-test");
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
    };
    expect(body.owned).toBe(false);
    expect(body.owner).toBe(false);
    expect(body.visibility).toBe("public");
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
});
