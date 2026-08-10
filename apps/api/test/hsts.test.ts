import { describe, it, expect } from "vitest";
import { HSTS, redirectHttpToHttps, withHsts } from "../src/http";

describe("redirectHttpToHttps", () => {
  it("301s public http to https, same host+path", () => {
    const res = redirectHttpToHttps(
      new Request("http://api.aft.page/v1/deploy?x=1"),
    );
    expect(res?.status).toBe(301);
    expect(res?.headers.get("location")).toBe("https://api.aft.page/v1/deploy?x=1");
  });

  it("leaves https and loopback http alone", () => {
    expect(redirectHttpToHttps(new Request("https://api.aft.page/"))).toBeNull();
    expect(redirectHttpToHttps(new Request("http://localhost:8787/"))).toBeNull();
    expect(redirectHttpToHttps(new Request("http://127.0.0.1:8787/"))).toBeNull();
  });

  it("uses x-forwarded-proto when the url is already https", () => {
    const res = redirectHttpToHttps(
      new Request("https://cname.aft.page/v1", {
        headers: { "x-forwarded-proto": "http" },
      }),
    );
    expect(res?.status).toBe(301);
    expect(res?.headers.get("location")).toBe("https://cname.aft.page/v1");
  });
});

describe("withHsts", () => {
  it("sets HSTS once", () => {
    const res = withHsts(new Response("ok"));
    expect(res.headers.get("strict-transport-security")).toBe(HSTS);
    expect(withHsts(res).headers.get("strict-transport-security")).toBe(HSTS);
  });
});
