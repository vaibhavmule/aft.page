import assert from "node:assert/strict";
import { viteChunkWarnIsOnlyFail } from "./vite-chunk-warn.ts";


const warn = `[plugin builtin:vite-reporter]
(!) Some chunks are larger than 500 kB after minification.
x Build failed in 36.60s
error during build:
[plugin builtin:vite-reporter]
(!) Some chunks are larger than 500 kB after minification.`;

assert.equal(viteChunkWarnIsOnlyFail(warn), true);
assert.equal(viteChunkWarnIsOnlyFail("syntax error"), false);
assert.equal(
  viteChunkWarnIsOnlyFail(
    `${warn}\nError: [vite]: Rolldown failed to resolve import "react" from "x"`,
  ),
  false,
);
console.log("ok");
