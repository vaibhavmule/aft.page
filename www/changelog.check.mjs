/** ponytail: page reads D1 via the public API; static dump must not sneak back in */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(dir, "changelog/index.html"), "utf8");
const redirects = readFileSync(join(dir, "_redirects"), "utf8");

if (!html.includes("https://api.aft.page/v1/changelog")) {
  throw new Error("changelog page must fetch /v1/changelog");
}
if (!html.includes("data-changelog-feed")) {
  throw new Error("changelog page missing feed mount");
}
if (html.includes("lattice-js") || html.includes("id=\"remote-mcp\"")) {
  throw new Error("changelog HTML should not hardcode entries");
}
if (!redirects.includes("/changelog.md https://api.aft.page/v1/changelog.md")) {
  throw new Error("_redirects must send /changelog.md to the API");
}

console.log("changelog.check: ok (api-backed)");
