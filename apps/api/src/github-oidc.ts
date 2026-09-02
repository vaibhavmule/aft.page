/** GitHub Actions OIDC — runner auth without putting job tokens in public inputs. */
export const GITHUB_OIDC_ISS = "https://token.actions.githubusercontent.com";
export const GITHUB_OIDC_JWKS = `${GITHUB_OIDC_ISS}/.well-known/jwks`;

export const RUNNER_WORKFLOWS = [
  "run-next.yml",
  "run-static-build.yml",
  "run-vite.yml",
] as const;

export type GithubOidcClaims = {
  iss?: unknown;
  aud?: unknown;
  exp?: unknown;
  nbf?: unknown;
  repository?: unknown;
  job_workflow_ref?: unknown;
  workflow_ref?: unknown;
  event_name?: unknown;
};

export function jobRunnerAudience(apiOrigin: string, jobId: string): string {
  return `${apiOrigin.replace(/\/$/, "")}/v1/jobs/${jobId}`;
}

export function runnerWorkflowAllowed(jobWorkflowRef: string, repo: string): boolean {
  const prefix = `${repo}/.github/workflows/`;
  if (!jobWorkflowRef.startsWith(prefix)) return false;
  const file = jobWorkflowRef.slice(prefix.length).split("@")[0] || "";
  return (RUNNER_WORKFLOWS as readonly string[]).includes(file);
}

export function oidcClaimsOk(
  claims: GithubOidcClaims,
  opts: { audience: string; repo: string; now?: number },
): boolean {
  if (claims.iss !== GITHUB_OIDC_ISS) return false;
  const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!aud.includes(opts.audience)) return false;
  if (claims.repository !== opts.repo) return false;
  if (claims.event_name !== "workflow_dispatch") return false;
  const wfRef =
    typeof claims.job_workflow_ref === "string"
      ? claims.job_workflow_ref
      : typeof claims.workflow_ref === "string"
        ? claims.workflow_ref
        : "";
  if (!runnerWorkflowAllowed(wfRef, opts.repo)) return false;
  const now = opts.now ?? Math.floor(Date.now() / 1000);
  if (typeof claims.exp !== "number" || claims.exp < now) return false;
  if (typeof claims.nbf === "number" && claims.nbf > now + 60) return false;
  return true;
}

function b64urlToBytes(s: string): Uint8Array {
  const pad = "=".repeat((4 - (s.length % 4)) % 4);
  const b64 = (s + pad).replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function b64urlJson(s: string): unknown {
  return JSON.parse(new TextDecoder().decode(b64urlToBytes(s)));
}

export async function verifyOidcJwt(
  jwt: string,
  getKey: (kid: string) => Promise<CryptoKey | null>,
): Promise<GithubOidcClaims | null> {
  const parts = jwt.split(".");
  if (parts.length !== 3) return null;
  const [h, p, sig] = parts;
  let header: { alg?: unknown; kid?: unknown };
  try {
    header = b64urlJson(h) as typeof header;
  } catch {
    return null;
  }
  if (header.alg !== "RS256" || typeof header.kid !== "string" || !header.kid) return null;
  const key = await getKey(header.kid);
  if (!key) return null;
  const ok = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    key,
    b64urlToBytes(sig),
    new TextEncoder().encode(`${h}.${p}`),
  );
  if (!ok) return null;
  try {
    const claims = b64urlJson(p);
    if (!claims || typeof claims !== "object") return null;
    return claims as GithubOidcClaims;
  } catch {
    return null;
  }
}

type Jwk = JsonWebKey & { kid?: string };

// ponytail: isolate-local JWKS cache. Stampede across isolates is fine; Cache API if it isn't.
let jwksCache: { keys: Jwk[]; exp: number } | null = null;

async function githubJwks(): Promise<Jwk[]> {
  if (jwksCache && jwksCache.exp > Date.now()) return jwksCache.keys;
  const res = await fetch(GITHUB_OIDC_JWKS, {
    headers: { accept: "application/json", "user-agent": "aft.page-run" },
    signal: AbortSignal.timeout(8_000),
  });
  if (!res.ok) return [];
  const body = (await res.json().catch(() => null)) as { keys?: Jwk[] } | null;
  const keys = Array.isArray(body?.keys) ? body.keys : [];
  if (keys.length) jwksCache = { keys, exp: Date.now() + 60 * 60 * 1000 };
  return keys;
}

async function githubJwksKey(kid: string): Promise<CryptoKey | null> {
  const keys = await githubJwks();
  const jwk = keys.find((k) => k.kid === kid);
  if (!jwk) return null;
  try {
    return await crypto.subtle.importKey(
      "jwk",
      jwk,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"],
    );
  } catch {
    return null;
  }
}

export async function verifyGithubActionsOidc(
  jwt: string,
  opts: { audience: string; repo: string },
): Promise<boolean> {
  try {
    const claims = await verifyOidcJwt(jwt, githubJwksKey);
    return claims ? oidcClaimsOk(claims, opts) : false;
  } catch {
    return false;
  }
}
