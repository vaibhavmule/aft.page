import assert from "node:assert/strict";
import { createAft, DEFAULT_API, deployMethod, filesFromHtml } from "./index.js";

assert.equal(DEFAULT_API, "https://api.aft.page");
assert.deepEqual(filesFromHtml("<h1>hi</h1>"), [
  { path: "index.html", content: "<h1>hi</h1>", encoding: "utf8" },
]);
assert.throws(() => filesFromHtml("  "), /html or files/);
assert.equal(deployMethod(), "POST");
assert.equal(deployMethod("demo"), "POST");
assert.equal(deployMethod("demo", "aft_edit_x"), "PATCH");
assert.throws(() => deployMethod(undefined, "aft_edit_x"), /slug/);

const calls = [];
const aft = createAft({
  fetch: async (url, init) => {
    calls.push({ url: String(url), init });
    return new Response(
      JSON.stringify({
        url: "https://demo.aft.page",
        slug: "demo",
        editToken: "aft_edit_x",
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  },
});

await aft.deploy({ html: "<h1>hi</h1>" });
assert.equal(calls[0].init.method, "POST");
assert.match(calls[0].url, /\/v1\/deploy$/);
assert.equal(calls[0].init.headers["x-aft-client"], "sdk");
assert.deepEqual(JSON.parse(calls[0].init.body).files[0].path, "index.html");

await aft.deploy({
  html: "<h1>hi</h1>",
  slug: "demo",
  editToken: "aft_edit_x",
});
assert.equal(calls[1].init.method, "PATCH");
assert.match(calls[1].url, /slug=demo/);
assert.equal(calls[1].init.headers["x-aft-edit-token"], "aft_edit_x");

console.log("ok");
