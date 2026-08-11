#!/usr/bin/env node
// Self-check: social scoring + sales pipeline upsert.
import assert from "node:assert/strict";
import {
  createMemoryDb,
  draftOutreach,
} from "./src/pipeline.ts";
import {
  SOCIAL_WATCHLIST,
  scoreProspectText,
  stripHtml,
} from "./src/social.ts";

assert.ok(SOCIAL_WATCHLIST.length >= 4);
assert.ok(SOCIAL_WATCHLIST.some((w) => w.platform === "x"));
assert.ok(SOCIAL_WATCHLIST.some((w) => w.platform === "linkedin"));

const hot = scoreProspectText(
  "I built this in Cursor but it's stuck on localhost — how do I deploy / share?",
);
assert.equal(hot.verdict, "hot");
assert.ok(hot.hits.includes("localhost"));
assert.ok(hot.hits.includes("cursor"));

const cold = scoreProspectText("Nice weather today in Mumbai");
assert.equal(cold.verdict, "cold");

const text = stripHtml("<html><script>x</script><title>Hi</title><p>cursor localhost</p></html>");
assert.match(text, /cursor localhost/);
assert.doesNotMatch(text, /script/);

const draft = draftOutreach({
  name: "Ada",
  channel: "x",
  signal: "Cursor localhost demo",
});
assert.match(draft.body, /localhost/i);

const db = createMemoryDb();
const lead = db.upsert({
  name: "ada",
  channel: "x",
  signal: "hot social check",
  stage: "new",
});
assert.equal(db.list().length, 1);
assert.equal(db.logTouch(lead.id, "sent")?.stage, "sent");

console.log("ok sales social check + pipeline");
