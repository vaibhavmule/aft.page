/** Plain-language why/fix for deploy failures. Used by ops + stored as hint. */

export type FailureExplainIn = {
  error: string;
  path?: string | null;
  slug?: string | null;
  source?: string | null;
  files?: number | null;
  bytes?: number | null;
  hint?: string | null;
};

export type FailureExplain = { why: string; fix: string };

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

export function explainDeployFailure(f: FailureExplainIn): FailureExplain {
  const path = f.path || "a file";
  const files = f.files != null ? String(f.files) : "n";
  const size = f.bytes != null ? ` Recorded ${formatBytes(f.bytes)}.` : "";

  switch (f.error) {
    case "no_files":
      return {
        why: "The request body was empty — no HTML paste, no multipart files, no JSON file list.",
        fix: "Send index.html. If this was MCP, Cursor never handed files to deploy_html / deploy_files.",
      };
    case "file_too_large":
      return {
        why: `${path} is over the per-file cap (static 10 MB, lattice/worker/next 10 MB).${size}`,
        fix: "Shrink or split that file. Do not upload a Next.js + native SQLite tree to Drop.",
      };
    case "payload_too_large":
      return {
        why: `Total upload is over the cap (static 50 MB, runtime 50 MB).${size} Files: ${files}.`,
        fix: "Ship a built static dist/ only — no node_modules, no .next, no SQLite DB.",
      };
    case "too_many_files":
      return {
        why: `Upload had ${files} files. Static cap is 200; runtime cap is 200.`,
        fix: "Deploy the built site, not the repo. Agents often dump the whole project.",
      };
    case "bad_path":
      return {
        why: `Path ${path} is unsafe (.., leading /, or backslash).`,
        fix: "Use relative paths like index.html or assets/app.js.",
      };
    case "reserved_slug":
      return {
        why: `Requested slug ${f.slug || path || "(reserved)"} is reserved for product hosts (api, ops, status, mcp, …).`,
        fix: "Pick another slug or omit preferred_slug.",
      };
    case "invalid_slug":
      return {
        why: "PATCH redeploy had a missing or invalid ?slug=.",
        fix: "Redeploy with the live slug and an edit token or owner session.",
      };
    case "unauthorized":
    case "forbidden":
      return {
        why: "Redeploy/update was not allowed for this session or edit token.",
        fix: "Use the editToken from the original deploy, or sign in as owner/editor.",
      };
    case "not_found":
      return {
        why: `No site for slug ${f.slug || "unknown"} — PATCH to a slug that was never deployed, or KV miss.`,
        fix: "POST a new deploy, or check the slug.",
      };
    case "slug_exhausted":
      return {
        why: "Could not allocate a unique slug after retries.",
        fix: "Retry; if it persists, D1/KV slug allocation is stuck.",
      };
    case "internal":
      return {
        why: f.hint
          ? `Worker threw: ${f.hint}`
          : "Unhandled exception in deploy. Message is only in logs / hint.",
        fix: "Open aft-page-api Workers Logs for this request id.",
      };
    default:
      return {
        why: f.hint || `Deploy rejected with code ${f.error}.`,
        fix: "Match the code in deploy.ts; search Workers Logs by request id.",
      };
  }
}
