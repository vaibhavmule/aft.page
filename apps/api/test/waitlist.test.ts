import { createExecutionContext, env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import worker from "../src/index";
import { API_ORIGIN, call } from "./helpers";

let requestNumber = 0;

function unavailableDb(): D1Database {
  return new Proxy(env.DB, {
    get(target, property, receiver) {
      if (property === "prepare") {
        return () => {
          throw new Error("sensitive database outage detail");
        };
      }
      return Reflect.get(target, property, receiver);
    },
  });
}

function signup(email: unknown, company = ""): Request {
  requestNumber += 1;
  return new Request(`${API_ORIGIN}/v1/waitlist`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "https://aft.page",
      "cf-connecting-ip": `192.0.2.${requestNumber}`,
    },
    body: JSON.stringify({ email, company }),
  });
}

describe("waitlist signup", () => {
  it("normalizes and stores a valid email", async () => {
    const res = await call(signup("  Founder@Example.COM  "));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true });

    const row = await env.DB.prepare(
      `SELECT email, source FROM waitlist_signups WHERE email = ?`,
    )
      .bind("founder@example.com")
      .first<{ email: string; source: string }>();
    expect(row).toEqual({ email: "founder@example.com", source: "marketing" });
  });

  it("accepts duplicates without creating another row", async () => {
    const email = "duplicate@example.com";
    const first = await call(signup(email));
    const duplicate = await call(signup(" DUPLICATE@example.com "));
    expect(first.status).toBe(200);
    expect(duplicate.status).toBe(200);
    expect(await duplicate.json()).toEqual(await first.json());

    const row = await env.DB.prepare(
      `SELECT COUNT(*) AS count FROM waitlist_signups WHERE email = ?`,
    )
      .bind(email)
      .first<{ count: number }>();
    expect(row?.count).toBe(1);
  });

  it("returns non-cacheable CORS responses without reflecting the email", async () => {
    const email = "private-address@example.com";
    const res = await call(signup(email));
    expect(res.headers.get("access-control-allow-origin")).toBe("https://aft.page");
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.text()).not.toContain(email);
  });

  it("answers browser preflight without touching D1", async () => {
    const res = await worker.fetch(
      new Request(`${API_ORIGIN}/v1/waitlist`, {
        method: "OPTIONS",
        headers: { origin: "https://aft.page" },
      }),
      { ...env, DB: unavailableDb() },
      createExecutionContext(),
    );

    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe("https://aft.page");
  });

  it("redacts storage failures behind a non-cacheable 503", async () => {
    const res = await worker.fetch(
      signup(`outage-${requestNumber}@example.com`),
      { ...env, DB: unavailableDb() },
      createExecutionContext(),
    );
    const text = await res.text();

    expect(res.status).toBe(503);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(text).toContain("temporarily_unavailable");
    expect(text).not.toContain("sensitive database outage detail");
  });

  it("rejects invalid email", async () => {
    const res = await call(signup("not-an-email"));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: "invalid_email" });

    for (const email of [
      "two..dots@example.com",
      "person@-example.com",
      "person@example..com",
      `${"a".repeat(65)}@example.com`,
    ]) {
      const invalid = await call(signup(email));
      expect(invalid.status).toBe(400);
    }
  });

  it("silently discards honeypot submissions", async () => {
    const email = "bot@example.com";
    const res = await call(signup(email, "https://spam.example"));
    expect(res.status).toBe(200);
    const row = await env.DB.prepare(
      `SELECT email FROM waitlist_signups WHERE email = ?`,
    )
      .bind(email)
      .first();
    expect(row).toBeNull();
  });

  it("rate-limits repeated requests from one address", async () => {
    const ip = "198.51.100.8";
    let res: Response | undefined;
    for (let i = 0; i < 11; i += 1) {
      const request = signup(`rate-${i}@example.com`);
      request.headers.set("cf-connecting-ip", ip);
      res = await call(request);
    }
    expect(res?.status).toBe(429);
    expect(res?.headers.get("retry-after")).toBe("3600");
  });

  it("rate-limits repeated submissions of the same normalized email", async () => {
    const email = `repeated-${requestNumber}@example.com`;
    let res: Response | undefined;
    for (let i = 0; i < 6; i += 1) {
      res = await call(signup(` ${email.toUpperCase()} `));
    }
    expect(res?.status).toBe(429);
    expect(res?.headers.get("retry-after")).toBe("3600");
  });

  it("never stores raw email or IP data in abuse-control keys", async () => {
    const email = `private-${requestNumber}@example.com`;
    const ip = "203.0.113.77";
    const request = signup(email);
    request.headers.set("cf-connecting-ip", ip);

    expect((await call(request)).status).toBe(200);

    const keys = await env.SITES.list({ prefix: "rl:waitlist:" });
    const serializedKeys = keys.keys.map(({ name }) => name).join("\n");
    expect(serializedKeys).not.toContain(email);
    expect(serializedKeys).not.toContain(ip);
    expect(keys.keys.every(({ name }) => /^rl:waitlist:(ip|email):[a-f0-9]{32}$/.test(name))).toBe(
      true,
    );
  });

  it("requires JSON and limits request size", async () => {
    const wrongType = await call(
      new Request(`${API_ORIGIN}/v1/waitlist`, {
        method: "POST",
        headers: { "content-type": "text/plain" },
        body: "person@example.com",
      }),
    );
    expect(wrongType.status).toBe(415);

    const tooLarge = await call(
      new Request(`${API_ORIGIN}/v1/waitlist`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: `${"a".repeat(2_100)}@example.com` }),
      }),
    );
    expect(tooLarge.status).toBe(413);

    const malformed = await call(
      new Request(`${API_ORIGIN}/v1/waitlist`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{",
      }),
    );
    expect(malformed.status).toBe(400);
    expect(await malformed.json()).toMatchObject({ error: "invalid_json" });
  });
});
