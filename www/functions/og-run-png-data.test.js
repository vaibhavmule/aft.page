import assert from "node:assert/strict";
import { OG_RUN_PNG_BASE64 } from "./og-run-png-data.js";

const binary = Buffer.from(OG_RUN_PNG_BASE64, "base64");
assert.equal(binary[0], 0x89);
assert.equal(binary.toString("ascii", 1, 4), "PNG");
assert.ok(binary.length > 20000, `expected sizable PNG, got ${binary.length}`);
console.log("og-run-png-data ok", binary.length);
