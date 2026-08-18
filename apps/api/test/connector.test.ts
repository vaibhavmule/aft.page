/** Connector invoke + capability enforcement. */
import { describe, it, expect } from "vitest";
import { env } from "cloudflare:test";
import {
  assignSiteOwner,
  createSession,
  findOrCreateUser,
} from "../src/auth";
import { API_ORIGIN, call, uploadJson } from "./helpers";

async function ownSite(slug: string, email: string): Promise<string> {
  const user = await findOrCreateUser(env, email);
  expect(await assignSiteOwner(env, slug, user.id)).toBe(true);
  const session = await createSession(env, user.id);
  return `aft_session=${session.token}`;
}

async function deployExpense(slug: string): Promise<{ slug: string }> {
  const res = await call(
    uploadJson(
      [
        { path: "index.html", content: "<h1>expenses</h1>" },
        {
          path: "aft.json",
          content: JSON.stringify({
            capabilities: {
              data: ["expenses:read", "expenses:approve"],
              secrets: ["slack-webhook"],
              egress: ["hooks.slack.com"],
            },
          }),
        },
      ],
      slug,
    ),
  );
  expect(res.status).toBe(200);
  const body = (await res.json()) as { slug: string };
  return body;
}

describe("connector", () => {
  it("denies invoke when capabilities are not approved", async () => {
    const { slug } = await deployExpense("conn-deny");
    await ownSite(slug, "conn-deny@example.com");

    const inv = await call(
      new Request(`${API_ORIGIN}/v1/sites/${slug}/connector/invoke`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: `https://${slug}.aft.page`,
        },
        body: JSON.stringify({ capability: "expenses:read" }),
      }),
    );
    expect(inv.status).toBe(403);
    const body = (await inv.json()) as { error: string };
    expect(body.error).toBe("capability_not_approved");
  });

  it("mints token, round-trips invoke via poll/result after approve", async () => {
    const { slug } = await deployExpense("conn-ok");
    const cookie = await ownSite(slug, "conn-ok@example.com");

    const approve = await call(
      new Request(`${API_ORIGIN}/v1/sites/${slug}/capabilities`, {
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

    const tokenRes = await call(
      new Request(`${API_ORIGIN}/v1/sites/${slug}/connector/tokens`, {
        method: "POST",
        headers: {
          cookie,
          origin: "https://aft.page",
          "content-type": "application/json",
        },
        body: JSON.stringify({ label: "test" }),
      }),
    );
    expect(tokenRes.status).toBe(200);
    const { token } = (await tokenRes.json()) as { token: string };
    expect(token).toMatch(/^aft_conn_/);

    const inv = await call(
      new Request(`${API_ORIGIN}/v1/sites/${slug}/connector/invoke`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: `https://${slug}.aft.page`,
        },
        body: JSON.stringify({ capability: "expenses:read", action: "list" }),
      }),
    );
    expect(inv.status).toBe(202);
    const pending = (await inv.json()) as { id: string; status: string };
    expect(pending.status).toBe("pending");

    const poll = await call(
      new Request(`${API_ORIGIN}/v1/connector/poll?wait=0`, {
        headers: { authorization: `Bearer ${token}` },
      }),
    );
    expect(poll.status).toBe(200);
    const job = (await poll.json()) as {
      id: string;
      capability: string;
    };
    expect(job.id).toBe(pending.id);
    expect(job.capability).toBe("expenses:read");

    const expenses = [
      {
        id: "1",
        title: "Team offsite lunch",
        amount: 4280,
        currency: "INR",
        submitter: "Alex",
        team: "Marketing",
        when: "yesterday",
      },
    ];
    const result = await call(
      new Request(`${API_ORIGIN}/v1/connector/result/${job.id}`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ ok: true, result: { expenses } }),
      }),
    );
    expect(result.status).toBe(200);

    const status = await call(
      new Request(
        `${API_ORIGIN}/v1/sites/${slug}/connector/invokes/${pending.id}`,
        { headers: { origin: `https://${slug}.aft.page` } },
      ),
    );
    expect(status.status).toBe(200);
    const done = (await status.json()) as {
      status: string;
      result: { expenses: { id: string }[] };
    };
    expect(done.status).toBe("done");
    expect(done.result.expenses[0]?.id).toBe("1");
  });

  it("denies invoke for capability not in approved grant", async () => {
    const { slug } = await deployExpense("conn-cap");
    const cookie = await ownSite(slug, "conn-cap@example.com");
    await call(
      new Request(`${API_ORIGIN}/v1/sites/${slug}/capabilities`, {
        method: "POST",
        headers: {
          cookie,
          origin: "https://aft.page",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          approved: {
            secrets: [],
            egress: [],
            data: ["expenses:read"],
          },
        }),
      }),
    );

    const inv = await call(
      new Request(`${API_ORIGIN}/v1/sites/${slug}/connector/invoke`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: `https://${slug}.aft.page`,
        },
        body: JSON.stringify({ capability: "expenses:approve" }),
      }),
    );
    expect(inv.status).toBe(403);
    const body = (await inv.json()) as { error: string };
    expect(body.error).toBe("capability_denied");
  });
});
