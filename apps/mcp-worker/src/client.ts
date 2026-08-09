/** Thin client for the aft.page deploy API via service binding (or any Fetcher). */

export type ApiTransport = {
  apiBase: string;
  fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
};

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

export async function health(api: ApiTransport): Promise<{ ok: boolean }> {
  const res = await api.fetch(`${api.apiBase}/health`);
  if (!res.ok) throw new Error(`health check failed (${res.status})`);
  return (await res.json()) as { ok: boolean };
}

export async function deployHtml(
  html: string,
  api: ApiTransport,
  slug?: string,
  editToken?: string,
): Promise<DeployResult> {
  const method = deployMethod(slug, editToken);
  const url = slug
    ? `${api.apiBase}/v1/deploy?slug=${encodeURIComponent(slug)}`
    : `${api.apiBase}/v1/deploy`;
  const res = await api.fetch(url, {
    method,
    headers: deployHeaders("text/html; charset=utf-8", editToken),
    body: html,
  });
  return readDeploy(res, editToken);
}

export async function deployFiles(
  files: { path: string; content: string; encoding?: "utf8" | "base64" }[],
  api: ApiTransport,
  slug?: string,
  editToken?: string,
): Promise<DeployResult> {
  slug = slug || slugFromFiles(files);
  const method = deployMethod(slug, editToken);
  const url = slug
    ? `${api.apiBase}/v1/deploy?slug=${encodeURIComponent(slug)}`
    : `${api.apiBase}/v1/deploy`;
  const res = await api.fetch(url, {
    method,
    headers: deployHeaders("application/json", editToken),
    body: JSON.stringify({ files }),
  });
  return readDeploy(res, editToken);
}

export async function listDeploys(
  api: ApiTransport,
  slug: string,
  editToken: string,
): Promise<DeploysResult> {
  const res = await api.fetch(`${api.apiBase}/v1/sites/${encodeURIComponent(slug)}/deploys`, {
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
  api: ApiTransport,
  slug: string,
  editToken: string,
  deployId: string,
): Promise<RollbackResult> {
  const res = await api.fetch(`${api.apiBase}/v1/sites/${encodeURIComponent(slug)}/rollback`, {
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
