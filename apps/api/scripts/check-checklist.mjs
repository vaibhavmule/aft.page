#!/usr/bin/env node
import assert from "node:assert/strict";
import { STARTUP_30D, checklistProgress } from "../src/ops-checklist.ts";

assert.ok(STARTUP_30D.length >= 20);
assert.ok(STARTUP_30D.some((i) => i.group === "Presence"));
assert.ok(STARTUP_30D.some((i) => i.group === "Email"));
assert.ok(STARTUP_30D.some((i) => i.group === "Socials"));
assert.ok(STARTUP_30D.some((i) => i.id === "domain-primary"));
assert.ok(STARTUP_30D.some((i) => i.id === "launch-now"));

const empty = checklistProgress(new Map());
assert.equal(empty.done, 0);
assert.equal(empty.total, STARTUP_30D.length);

const one = new Map([["domain-primary", { done: true, note: "" }]]);
assert.equal(checklistProgress(one).done, 1);

console.log("ok ops startup checklist seed");
