/** Thin client for the public aft.page deploy API. */

export const DEFAULT_API = "https://api.aft.page";

export type DeployResult = {
  ok: true;
  slug: string;
  deployId: string;
  url: string;
  files: number;
  bytes: number;
  editToken: string;
  claimUrl?: string;
  owned?: boolean;
  notice?: string;
};

export type DeployError = {
  ok?: false;
  error: string;
  message?: string;
  hint?: string;
};

export type DeployOpts = {
  slug?: string;
  editToken?: string;
  apiBase?: string;
};

export type DeploysResult = {
  slug: string;
  currentDeployId: string | null;
  deploys: {
    id: string;
    createdAt: string;
    fileCount: number;
    bytes: number;
    source: string;
    client: string;
  }[];
};

export type RollbackResult = {
  ok: true;
  slug: string;
  deployId: string;
  url: string;
  rolledBack: true;
};

export type RepoDeployResult = {
  url: string;
  slug: string;
  jobId: string;
  owner: string;
  repo: string;
  kind?: string;
  branch?: string;
  editToken?: string;
  claimUrl?: string;
};

export type RepoJobSnapshot = {
  jobId: string;
  status: string;
  kind?: string;
  phase?: string;
  slug?: string;
  url?: string;
  owner?: string;
  repo?: string;
  reason?: string;
  error?: string;
  logTail?: string;
};

/** One MCP `deploy` tool: html is just files=[{path:index.html}]. */
export function filesFromDeployInput(opts: {
  html?: string;
  files?: { path: string; content: string; encoding?: "utf8" | "base64" }[];
}): { path: string; content: string; encoding?: "utf8" | "base64" }[] {
  if (opts.files?.length) return opts.files;
  const html = opts.html?.trim();
  if (html) return [{ path: "index.html", content: html, encoding: "utf8" }];
  throw new Error("deploy needs html or files");
}

/** PATCH same slug when editToken is set; otherwise first-hit POST (may suffix). */
export function deployMethod(slug?: string, editToken?: string): "POST" | "PATCH" {
  if (editToken) {
    if (!slug) throw new Error("edit_token requires preferred_slug (the locked site slug)");
    return "PATCH";
  }
  return "POST";
}

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,46}[a-z0-9])?$/;

/** If the agent included aft.json, use its slug when preferred_slug was omitted. */
export function slugFromFiles(
  files: { path: string; content: string; encoding?: "utf8" | "base64" }[],
): string | undefined {
  const aft = files.find(
    (f) => f.path === "aft.json" || f.path.endsWith("/aft.json") || f.path === "./aft.json",
  );
  if (!aft || aft.encoding === "base64") return undefined;
  try {
    const slug = String((JSON.parse(aft.content) as { slug?: unknown }).slug || "")
      .toLowerCase()
      .trim();
    return SLUG_RE.test(slug) ? slug : undefined;
  } catch {
    return undefined;
  }
}

function deployHeaders(contentType: string, editToken?: string): Record<string, string> {
  const headers: Record<string, string> = {
    "content-type": contentType,
    "x-aft-client": "mcp",
  };
  if (editToken) headers["x-aft-edit-token"] = editToken;
  return headers;
}

async function readDeploy(res: Response, editToken?: string): Promise<DeployResult> {
  const body = (await res.json()) as DeployResult | DeployError;
  if (!res.ok || !("url" in body)) {
    const err = body as DeployError;
    throw new Error(err.message || err.error || `deploy failed (${res.status})`);
  }
  const result = body as DeployResult;
  if (editToken && !result.editToken) result.editToken = editToken;
  return result;
}

export async function health(apiBase = DEFAULT_API): Promise<{
  ok: boolean;
}> {
  const res = await fetch(`${apiBase}/health`);
  if (!res.ok) throw new Error(`health check failed (${res.status})`);
  return (await res.json()) as { ok: boolean };
}

export async function deployHtml(
  html: string,
  opts?: DeployOpts,
): Promise<DeployResult> {
  const apiBase = opts?.apiBase ?? DEFAULT_API;
  const method = deployMethod(opts?.slug, opts?.editToken);
  const url = opts?.slug
    ? `${apiBase}/v1/deploy?slug=${encodeURIComponent(opts.slug)}`
    : `${apiBase}/v1/deploy`;
  const res = await fetch(url, {
    method,
    headers: deployHeaders("text/html; charset=utf-8", opts?.editToken),
    body: html,
  });
  return readDeploy(res, opts?.editToken);
}

export async function deployFiles(
  files: { path: string; content: string; encoding?: "utf8" | "base64" }[],
  opts?: DeployOpts,
): Promise<DeployResult> {
  const apiBase = opts?.apiBase ?? DEFAULT_API;
  const slug = opts?.slug || slugFromFiles(files);
  const method = deployMethod(slug, opts?.editToken);
  const url = slug
    ? `${apiBase}/v1/deploy?slug=${encodeURIComponent(slug)}`
    : `${apiBase}/v1/deploy`;
  const res = await fetch(url, {
    method,
    headers: deployHeaders("application/json", opts?.editToken),
    body: JSON.stringify({ files }),
  });
  return readDeploy(res, opts?.editToken);
}

export async function listDeploys(
  slug: string,
  editToken: string,
  apiBase = DEFAULT_API,
): Promise<DeploysResult> {
  const res = await fetch(`${apiBase}/v1/sites/${encodeURIComponent(slug)}/deploys`, {
    headers: {
      "x-aft-client": "mcp",
      "x-aft-edit-token": editToken,
    },
  });
  const body = (await res.json()) as DeploysResult | DeployError;
  if (!res.ok || !("deploys" in body)) {
    const err = body as DeployError;
    throw new Error(err.message || err.error || `list deploys failed (${res.status})`);
  }
  return body;
}

export async function rollbackSite(
  slug: string,
  editToken: string,
  deployId: string,
  apiBase = DEFAULT_API,
): Promise<RollbackResult> {
  const res = await fetch(`${apiBase}/v1/sites/${encodeURIComponent(slug)}/rollback`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-aft-client": "mcp",
      "x-aft-edit-token": editToken,
    },
    body: JSON.stringify({ deployId }),
  });
  const body = (await res.json()) as RollbackResult | DeployError;
  if (!res.ok || !("rolledBack" in body)) {
    const err = body as DeployError;
    throw new Error(err.message || err.error || `rollback failed (${res.status})`);
  }
  return body;
}

function normalizeGithubUrl(input: string): string {
  const raw = input.trim();
  if (/^https?:\/\//i.test(raw) || /github\.com/i.test(raw)) return raw;
  if (/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(raw)) {
    return `https://github.com/${raw}`;
  }
  throw new Error("deploy_repo needs a GitHub URL or owner/repo");
}

export async function getRepoJob(
  jobId: string,
  apiBase = DEFAULT_API,
): Promise<RepoJobSnapshot> {
  const res = await fetch(`${apiBase}/v1/jobs/${encodeURIComponent(jobId)}`, {
    headers: { "x-aft-client": "mcp" },
  });
  const body = (await res.json()) as RepoJobSnapshot & DeployError;
  if (!res.ok) {
    throw new Error(body.message || body.error || `job poll failed (${res.status})`);
  }
  return body;
}

export async function deployRepo(
  githubUrl: string,
  opts: { apiBase?: string; waitMs?: number; pollMs?: number } = {},
): Promise<RepoDeployResult> {
  const apiBase = opts.apiBase ?? DEFAULT_API;
  const url = normalizeGithubUrl(githubUrl);
  const res = await fetch(`${apiBase}/v1/repo/deploy`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-aft-client": "mcp",
    },
    body: JSON.stringify({ url }),
  });
  const body = (await res.json()) as Record<string, unknown> & DeployError;
  if (!res.ok) {
    throw new Error(
      String(body.reason || body.message || body.error || `deploy_repo failed (${res.status})`),
    );
  }
  if (res.status === 202 && typeof body.jobId === "string") {
    const waitMs = opts.waitMs ?? 12 * 60 * 1000;
    const pollMs = opts.pollMs ?? 2000;
    const deadline = Date.now() + waitMs;
    let snap = body as RepoJobSnapshot;
    while (Date.now() < deadline) {
      snap = await getRepoJob(body.jobId, apiBase);
      if (snap.status === "live" && snap.url) {
        return {
          url: String(snap.url),
          slug: String(snap.slug || body.slug || ""),
          jobId: body.jobId,
          owner: String(snap.owner || body.owner || ""),
          repo: String(snap.repo || body.repo || ""),
          kind: snap.kind ? String(snap.kind) : body.kind ? String(body.kind) : undefined,
          branch: snap.branch ? String(snap.branch) : body.branch ? String(body.branch) : undefined,
        };
      }
      if (snap.status === "failed") {
        throw new Error(snap.reason || snap.error || "Build failed.");
      }
      await new Promise((resolve) => setTimeout(resolve, pollMs));
    }
    throw new Error("Build timed out. Retry deploy_repo or check ops.aft.page/run.");
  }
  if (typeof body.url === "string" && typeof body.slug === "string") {
    return {
      url: body.url,
      slug: body.slug,
      jobId: String(body.jobId || ""),
      owner: String(body.owner || ""),
      repo: String(body.repo || ""),
      branch: body.branch ? String(body.branch) : undefined,
      editToken: body.editToken ? String(body.editToken) : undefined,
      claimUrl: body.claimUrl ? String(body.claimUrl) : undefined,
    };
  }
  throw new Error("deploy_repo returned an unexpected response.");
}
