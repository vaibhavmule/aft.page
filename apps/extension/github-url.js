const SKIP_FIRST = new Set([
  "about",
  "account",
  "apps",
  "auth",
  "blog",
  "codespaces",
  "collections",
  "contact",
  "customer-stories",
  "dashboard",
  "enterprise",
  "events",
  "explore",
  "features",
  "git-guides",
  "home",
  "issues",
  "login",
  "logout",
  "marketplace",
  "new",
  "notifications",
  "open-source",
  "organizations",
  "orgs",
  "pricing",
  "pulls",
  "readme",
  "search",
  "security",
  "sessions",
  "settings",
  "signup",
  "site",
  "sitemap",
  "sponsors",
  "stars",
  "topics",
  "trending",
]);

const SKIP_REST = new Set(["settings", "security"]);

export function parseGithubRepoUrl(input) {
  if (!input) return null;
  let u;
  try {
    u = new URL(String(input), "https://github.com");
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^www\./i, "").toLowerCase();
  if (host !== "github.com") return null;
  const parts = u.pathname.split("/").filter(Boolean);
  if (parts.length < 2) return null;
  const owner = parts[0];
  let repo = parts[1];
  if (!owner || !repo) return null;
  if (SKIP_FIRST.has(owner.toLowerCase())) return null;
  repo = repo.replace(/\.git$/i, "");
  if (!/^[A-Za-z0-9_.-]+$/.test(owner) || !/^[A-Za-z0-9_.-]+$/.test(repo)) {
    return null;
  }
  if (owner.toLowerCase() === "orgs" || repo.toLowerCase() === "github") {
    return null;
  }
  return { owner, repo };
}

export function isGithubRepoPage(input) {
  const ref = parseGithubRepoUrl(input);
  if (!ref) return false;
  let u;
  try {
    u = new URL(String(input), "https://github.com");
  } catch {
    return false;
  }
  const rest = (u.pathname.split("/").filter(Boolean)[2] || "").toLowerCase();
  return !SKIP_REST.has(rest);
}

export function githubRepoHref(ref) {
  return `https://github.com/${ref.owner}/${ref.repo}`;
}
