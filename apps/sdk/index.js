/** libaft — embeddable client for the public aft.page deploy API. */

export const DEFAULT_API = "https://api.aft.page";

export function filesFromHtml(html) {
  const text = String(html ?? "").trim();
  if (!text) throw new Error("deploy needs html or files");
  return [{ path: "index.html", content: text, encoding: "utf8" }];
}

export function deployMethod(slug, editToken) {
  if (editToken) {
    if (!slug) throw new Error("editToken requires slug");
    return "PATCH";
  }
  return "POST";
}

export function createAft(opts = {}) {
  const apiBase = String(opts.apiBase || DEFAULT_API).replace(/\/$/, "");
  const fetchFn = opts.fetch || globalThis.fetch.bind(globalThis);
  const client = opts.client || "sdk";
  const defaultToken = opts.token;

  async function request(path, { method, json, editToken, token } = {}) {
    const headers = { "x-aft-client": client };
    const bearer = token ?? defaultToken;
    if (bearer) headers.authorization = `Bearer ${bearer}`;
    if (editToken) headers["x-aft-edit-token"] = editToken;
    if (json !== undefined) headers["content-type"] = "application/json";
    const res = await fetchFn(`${apiBase}${path}`, {
      method: method || "GET",
      headers,
      body: json !== undefined ? JSON.stringify(json) : undefined,
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(body.hint || body.message || body.error || `aft ${res.status}`);
    }
    return body;
  }

  return {
    apiBase,
    health: () => request("/health"),
    deploy: ({ html, files, slug, editToken } = {}) => {
      const payload = files?.length ? files : filesFromHtml(html);
      const method = deployMethod(slug, editToken);
      const path = slug
        ? `/v1/deploy?slug=${encodeURIComponent(slug)}`
        : "/v1/deploy";
      return request(path, {
        method,
        json: { files: payload },
        editToken,
      });
    },
    deploys: (slug, editToken) =>
      request(`/v1/sites/${encodeURIComponent(slug)}/deploys`, { editToken }),
    rollback: (slug, deployId, { editToken, token } = {}) =>
      request(`/v1/sites/${encodeURIComponent(slug)}/rollback`, {
        method: "POST",
        json: { deployId },
        editToken,
        token,
      }),
  };
}
