import { describe, expect, it } from "vitest";
import { scrubProductSurface } from "../src/product-surface";

describe("scrubProductSurface", () => {
  it("strips vendor names from run logs", () => {
    const raw =
      "opennextjs-cloudflare build\nWrangler deploy failed\nCloudflare Workers error on workers.dev";
    const out = scrubProductSurface(raw);
    expect(out).not.toMatch(/opennext|Wrangler|Cloudflare|workers\.dev/i);
    expect(out).toMatch(/next build/i);
    expect(out).toMatch(/deploy failed/i);
  });
});
