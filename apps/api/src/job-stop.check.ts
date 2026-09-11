import assert from "node:assert/strict";
import { jobStopToken, verifyJobStopToken } from "./job-stop.ts";
import type { Env } from "./env.ts";

const env = { AUTH_SECRET: "test-auth-secret-for-vitest-only" } as Env;

const a = await jobStopToken(env, "run_aaa");
const b = await jobStopToken(env, "run_bbb");
assert.match(a, /^run_stop_[0-9a-f]{64}$/);
assert.notEqual(a, b);
assert.equal(await verifyJobStopToken(env, "run_aaa", a), true);
assert.equal(await verifyJobStopToken(env, "run_bbb", a), false);
assert.equal(await verifyJobStopToken(env, "run_aaa", ""), false);
assert.equal(await verifyJobStopToken(env, "run_aaa", "run_tok_not_a_stop"), false);
assert.equal(await jobStopToken(env, "run_aaa"), a);

console.log("job-stop.check.ts: ok");
