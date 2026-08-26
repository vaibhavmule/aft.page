import {
  MAX_FILE_BYTES,
  MAX_FILE_BYTES_RUNTIME,
  MAX_FILES,
  MAX_FILES_RUNTIME,
  MAX_TOTAL_BYTES,
  MAX_TOTAL_BYTES_RUNTIME,
} from "./env";

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

function capMb(bytes: number) {
  return `${Math.round(bytes / (1024 * 1024))} MB`;
}

export function explainDeployFailure(f: FailureExplainIn): FailureExplain {
  const path = f.path || "a file";
  const files = f.files != null ? String(f.files) : "n";
  const size = f.bytes != null ? ` Recorded ${formatBytes(f.bytes)}.` : "";

  switch (f.error) {
    case "needs_build":
      return {
        why: "This project is a bundler app (Vite / CRA / Next static) with no dist/, out/, or build/ yet.",
        fix: "Run the project's build script, then deploy that output folder — not the source tree. Or paste the public GitHub repo.",
      };
    case "needs_next_build":
      return {
        why: "Next.js app — aft will build and publish a live URL.",
        fix: "Run aft deploy, or paste the public GitHub repo on aft.page/run.",
      };
    case "needs_container":
      return {
        why: f.hint
          ? f.hint
          : "This app needs a process runner (server).",
        fix: "Paste the public GitHub repo on aft.page/run, or ship a static/Next build.",
      };
    case "not_a_site":
      return {
        why: f.hint
          ? f.hint
          : "This is a database, cache, or queue — not a website.",
        fix: "Nothing to host. Point aft at a web app (static, Vite, or Next.js).",
      };
    case "no_index":
      return {
        why: "The deploy root has no index.html, so the live URL would 404.",
        fix: "Ship a static site with index.html at the root (after build: dist/, out/, or build/).",
      };
    case "not_static":
      return {
        why: "This looks like a custom server app — set runtime + upstream in aft.json.",
        fix: "Put the live server URL in aft.json, then aft deploy the mapping site.",
      };
    case "unknown_project":
      return {
        why: "No package.json frontend and no index.html — not a static site aft can host.",
        fix: "Add a static index.html, or a Vite/Next/CRA app with a build that emits one.",
      };
    case "no_files":
      return {
        why: "The request body was empty — no HTML paste, no multipart files, no JSON file list.",
        fix: "Send index.html. If this was MCP, Cursor never handed files to deploy_html / deploy_files.",
      };
    case "file_too_large":
      return {
        why: `${path} is over the per-file cap (static ${capMb(MAX_FILE_BYTES)}, worker/next ${capMb(MAX_FILE_BYTES_RUNTIME)}).${size}`,
        fix: "Shrink or split that file. Do not upload a Next.js + native SQLite tree to Drop.",
      };
    case "payload_too_large":
      return {
        why: `Total upload is over the cap (static ${capMb(MAX_TOTAL_BYTES)}, runtime ${capMb(MAX_TOTAL_BYTES_RUNTIME)}).${size} Files: ${files}.`,
        fix: "Ship a built static dist/ only — no node_modules, no .next, no SQLite DB.",
      };
    case "too_many_files":
      return {
        why: `Upload had ${files} files. Static cap is ${MAX_FILES}; runtime cap is ${MAX_FILES_RUNTIME}.`,
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
          ? `Something went wrong: ${f.hint}`
          : "Something went wrong on our side.",
        fix: "Retry. If it keeps failing, contact support with the request id.",
      };
    default:
      return {
        why: f.hint || `Deploy rejected (${f.error}).`,
        fix: "Retry, or check aft.page/docs for this error code.",
      };
  }
}
