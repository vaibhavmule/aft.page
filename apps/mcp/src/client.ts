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
};

export type DeployError = {
  ok?: false;
  error: string;
  message?: string;
  hint?: string;
};

export async function health(apiBase = DEFAULT_API): Promise<{
  ok: boolean;
}> {
  const res = await fetch(`${apiBase}/health`);
  if (!res.ok) throw new Error(`health check failed (${res.status})`);
  return (await res.json()) as { ok: boolean };
}

export async function deployHtml(
  html: string,
  opts?: { slug?: string; apiBase?: string },
): Promise<DeployResult> {
  const apiBase = opts?.apiBase ?? DEFAULT_API;
  const url = opts?.slug
    ? `${apiBase}/v1/deploy?slug=${encodeURIComponent(opts.slug)}`
    : `${apiBase}/v1/deploy`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "text/html; charset=utf-8",
      "x-aft-client": "mcp",
    },
    body: html,
  });
  const body = (await res.json()) as DeployResult | DeployError;
  if (!res.ok || !("url" in body)) {
    const err = body as DeployError;
    throw new Error(err.message || err.error || `deploy failed (${res.status})`);
  }
  return body as DeployResult;
}

export async function deployFiles(
  files: { path: string; content: string; encoding?: "utf8" | "base64" }[],
  opts?: { slug?: string; apiBase?: string },
): Promise<DeployResult> {
  const apiBase = opts?.apiBase ?? DEFAULT_API;
  const url = opts?.slug
    ? `${apiBase}/v1/deploy?slug=${encodeURIComponent(opts.slug)}`
    : `${apiBase}/v1/deploy`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-aft-client": "mcp",
    },
    body: JSON.stringify({ files }),
  });
  const body = (await res.json()) as DeployResult | DeployError;
  if (!res.ok || !("url" in body)) {
    const err = body as DeployError;
    throw new Error(err.message || err.error || `deploy failed (${res.status})`);
  }
  return body as DeployResult;
}
