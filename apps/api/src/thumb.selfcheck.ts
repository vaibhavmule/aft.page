/** Pure URL helpers check (no Worker imports). Run: npx tsx src/thumb.selfcheck.ts */
function siteThumbPath(): string {
  return "__aft/thumb.jpg";
}

function siteThumbUrl(
  slug: string,
  rootDomain: string,
  deployId?: string | null,
): string {
  const root = (rootDomain || "aft.page").replace(/^https?:\/\//i, "").replace(/\/$/, "");
  const base = `https://${slug}.${root}/${siteThumbPath()}`;
  return deployId ? `${base}?d=${encodeURIComponent(deployId)}` : base;
}

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

assert(siteThumbPath() === "__aft/thumb.jpg", "path");
assert(
  siteThumbUrl("hello", "aft.page") === "https://hello.aft.page/__aft/thumb.jpg",
  "url without deploy",
);
assert(
  siteThumbUrl("hello", "aft.page", "dep_abc") ===
    "https://hello.aft.page/__aft/thumb.jpg?d=dep_abc",
  "url with deploy",
);
console.log("thumb.selfcheck: ok");
