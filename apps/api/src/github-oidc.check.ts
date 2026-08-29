import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  GITHUB_OIDC_ISS,
  jobRunnerAudience,
  oidcClaimsOk,
  runnerWorkflowAllowed,
  verifyOidcJwt,
  type GithubOidcClaims,
} from "./github-oidc.ts";

assert.equal(
  jobRunnerAudience("https://api.aft.page/", "run_abc"),
  "https://api.aft.page/v1/jobs/run_abc",
);

const repo = "vaibhavmule/aft.page";
assert.equal(
  runnerWorkflowAllowed(`${repo}/.github/workflows/run-next.yml@refs/heads/main`, repo),
  true,
);
assert.equal(
  runnerWorkflowAllowed(`${repo}/.github/workflows/run-static-build.yml@refs/heads/main`, repo),
  true,
);
assert.equal(
  runnerWorkflowAllowed(`${repo}/.github/workflows/evil.yml@refs/heads/main`, repo),
  false,
);
assert.equal(
  runnerWorkflowAllowed(`evil/fork/.github/workflows/run-next.yml@refs/heads/main`, repo),
  false,
);

const aud = jobRunnerAudience("https://api.aft.page", "run_abc");
const now = 1_700_000_000;
const good: GithubOidcClaims = {
  iss: GITHUB_OIDC_ISS,
  aud,
  exp: now + 3600,
  nbf: now - 10,
  repository: repo,
  job_workflow_ref: `${repo}/.github/workflows/run-next.yml@refs/heads/main`,
  event_name: "workflow_dispatch",
};
assert.equal(oidcClaimsOk(good, { audience: aud, repo, now }), true);
assert.equal(oidcClaimsOk({ ...good, aud: "https://api.aft.page" }, { audience: aud, repo, now }), false);
assert.equal(oidcClaimsOk({ ...good, repository: "evil/fork" }, { audience: aud, repo, now }), false);
assert.equal(
  oidcClaimsOk(
    { ...good, job_workflow_ref: undefined, workflow_ref: `${repo}/.github/workflows/run-vite.yml@refs/heads/main` },
    { audience: aud, repo, now },
  ),
  true,
);
assert.equal(oidcClaimsOk({ ...good, event_name: "pull_request" }, { audience: aud, repo, now }), false);
assert.equal(oidcClaimsOk({ ...good, exp: now - 1 }, { audience: aud, repo, now }), false);

function b64url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function b64urlJson(obj: unknown): string {
  return b64url(new TextEncoder().encode(JSON.stringify(obj)));
}

const pair = await crypto.subtle.generateKey(
  { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]) },
  true,
  ["sign", "verify"],
);
const header = b64urlJson({ alg: "RS256", kid: "test" });
const payload = b64urlJson(good);
const sig = new Uint8Array(
  await crypto.subtle.sign("RSASSA-PKCS1-v1_5", pair.privateKey, new TextEncoder().encode(`${header}.${payload}`)),
);
const jwt = `${header}.${payload}.${b64url(sig)}`;
const claims = await verifyOidcJwt(jwt, async (kid) => (kid === "test" ? pair.publicKey : null));
assert.ok(claims);
assert.equal(oidcClaimsOk(claims, { audience: aud, repo, now }), true);
assert.equal(await verifyOidcJwt(jwt.slice(0, -4) + "xxxx", async () => pair.publicKey), null);
assert.equal(await verifyOidcJwt("not-a-jwt", async () => pair.publicKey), null);

const here = dirname(fileURLToPath(import.meta.url));
const jobsSrc = readFileSync(join(here, "jobs.ts"), "utf8");
const ghaFn = jobsSrc.slice(
  jobsSrc.indexOf("export function ghaDispatchInputs"),
  jobsSrc.indexOf("export async function dispatchRunBuildWorkflow"),
);
assert.ok(ghaFn.length > 80);
assert.doesNotMatch(ghaFn, /job_token/);

const root = join(here, "../../..");
for (const wf of ["run-next.yml", "run-static-build.yml", "run-vite.yml"]) {
  const yml = readFileSync(join(root, ".github/workflows", wf), "utf8");
  assert.match(yml, /id-token:\s*write/);
  assert.doesNotMatch(yml, /JOB_TOKEN:\s*\$\{\{\s*inputs\.job_token/);
}

console.log("ok");
