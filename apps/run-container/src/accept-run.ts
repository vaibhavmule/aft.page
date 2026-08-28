/**
 * /v1/run is only for the API Worker service binding.
 * Public hosts (run-container.aft.page, *.workers.dev) must 404.
 */
export const INTERNAL_RUN_HOST = "run-container.internal";

const GH_NAME = /^[A-Za-z0-9_.-]{1,100}$/;
const SLUG = /^[a-z0-9](?:[a-z0-9-]{0,46}[a-z0-9])?$/;
const BRANCH = /^[A-Za-z0-9._/-]{1,200}$/;
const JOB_ID = /^run_[a-z0-9]{8,64}$/;
const JOB_TOKEN = /^run_tok_[A-Za-z0-9_-]{16,200}$/;

export type AcceptedRun = {
  jobId: string;
  jobToken: string;
  owner: string;
  repo: string;
  slug: string;
  branch: string;
  plan: Record<string, unknown> | null;
};

export function isInternalRunHost(hostname: string): boolean {
  return hostname.toLowerCase() === INTERNAL_RUN_HOST;
}

function ghName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const s = raw.trim();
  if (!GH_NAME.test(s) || s === "." || s === "..") return null;
  return s;
}

export function acceptRunBody(
  body: unknown,
): { ok: true; value: AcceptedRun } | { ok: false; error: string } {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "invalid_json" };
  }
  const b = body as Record<string, unknown>;
  const jobId = typeof b.job_id === "string" ? b.job_id.trim() : "";
  const jobToken = typeof b.job_token === "string" ? b.job_token.trim() : "";
  const owner = ghName(b.owner);
  const repo = ghName(b.repo);
  const slug = typeof b.slug === "string" ? b.slug.trim().toLowerCase() : "";
  const branch =
    typeof b.branch === "string" && b.branch.trim() ? b.branch.trim() : "main";

  if (!JOB_ID.test(jobId) || !JOB_TOKEN.test(jobToken)) {
    return { ok: false, error: "missing_fields" };
  }
  if (!owner || !repo || !SLUG.test(slug) || !BRANCH.test(branch) || branch.includes("..")) {
    return { ok: false, error: "missing_fields" };
  }

  let plan: Record<string, unknown> | null = null;
  if (b.plan && typeof b.plan === "object" && !Array.isArray(b.plan)) {
    plan = b.plan as Record<string, unknown>;
  }

  return {
    ok: true,
    value: { jobId, jobToken, owner, repo, slug, branch, plan },
  };
}
