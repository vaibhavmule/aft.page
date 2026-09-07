import { describe, expect, it } from "vitest";
import { parseRdapResponse } from "../src/brand-domains";

const registered = {
  objectClassName: "domain",
  ldhName: "aft.dev",
  status: ["active"],
  events: [
    { eventAction: "registration", eventDate: "2021-02-17T04:55:22.065Z" },
    { eventAction: "expiration", eventDate: "2027-02-17T04:55:22.065Z" },
  ],
  entities: [
    {
      roles: ["registrar"],
      vcardArray: [
        "vcard",
        [
          ["version", {}, "text", "4.0"],
          ["fn", {}, "text", "Squarespace Domains II LLC."],
        ],
      ],
    },
  ],
};

describe("parseRdapResponse", () => {
  it("registered domain reads expiry + registrar from events/entities", () => {
    const probe = parseRdapResponse("aft.dev", registered as never, 200);
    expect(probe.status).toBe("registered");
    expect(probe.expiresAt).toBe("2027-02-17T04:55:22.065Z");
    expect(probe.registrar).toBe("Squarespace Domains II LLC.");
    expect(probe.error).toBeUndefined();
  });

  it("404 no-match means available", () => {
    const probe = parseRdapResponse(
      "aft.dev",
      { objectClassName: "error", errorCode: 404, title: "No match" } as never,
      404,
    );
    expect(probe.status).toBe("available");
    expect(probe.error).toBeUndefined();
  });

  it("non-domain / non-JSON body without 404 is unknown", () => {
    expect(parseRdapResponse("aft.dev", null, 200).status).toBe("unknown");
    expect(parseRdapResponse("aft.dev", { rdapConformance: [] } as never, 200).status).toBe("unknown");
  });
});
