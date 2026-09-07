/**
 * Shared Run client for aft.page — used by the /run/ page and the homepage
 * hero Run tab. DOM-independent: callers own their UI, this owns the repo
 * deploy API + job watching pipeline.
 */
import { classifyLog, headlineFor, scrubSurface } from "./run-log.mjs"

// Re-export the log helpers so `run-client.js` is the single facade for Run
// consumers (run.js, home-run.js) — nobody imports run-log.mjs directly.
export { classifyLog, headlineFor, scrubSurface }

export const RUN_API = "https://api.aft.page"

const SKIP_OWNERS = new Set([
  "about",
  "apps",
  "blog",
  "explore",
  "features",
  "login",
  "marketplace",
  "new",
  "orgs",
  "pricing",
  "settings",
  "topics",
  "trending",
])

export function aliasRoot(raw) {
  const s = String(raw || "").replace(/\\/g, "/").replace(/^\/+|\/+$/g, "")
  if (!s || s.includes("..")) return ""
  const lower = s.toLowerCase()
  if (lower === "front-end" || lower === "front_end") return "frontend"
  if (lower === "back-end" || lower === "back_end") return "backend"
  return s
}

export function parseRunPath(pathname) {
  const parts = String(pathname || location.pathname)
    .replace(/\/+$/, "")
    .split("/")
    .filter(Boolean)
  if (parts[0] !== "run" || parts.length < 3) return null
  const owner = decodeURIComponent(parts[1] || "")
  const repo = decodeURIComponent(parts[2] || "").replace(/\.git$/i, "")
  if (!owner || !repo || SKIP_OWNERS.has(owner.toLowerCase())) return null
  if (!/^[A-Za-z0-9_.-]+$/.test(owner) || !/^[A-Za-z0-9_.-]+$/.test(repo)) return null
  const rest = parts.slice(3).map((p) => decodeURIComponent(p)).join("/")
  const root = aliasRoot(rest)
  return root ? { owner, repo, root } : { owner, repo }
}

export function parseGithubInput(raw) {
  const s = String(raw || "").trim()
  if (!s) return null
  if (/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(s)) {
    const [owner, repo] = s.split("/")
    return { owner, repo: repo.replace(/\.git$/i, "") }
  }
  try {
    const u = new URL(s, "https://github.com")
    if (u.hostname.replace(/^www\./i, "").toLowerCase() !== "github.com") return null
    const parts = u.pathname.split("/").filter(Boolean)
    if (parts.length < 2) return null
    const owner = parts[0]
    const repo = parts[1].replace(/\.git$/i, "")
    if (SKIP_OWNERS.has(owner.toLowerCase())) return null
    if (!/^[A-Za-z0-9_.-]+$/.test(owner) || !/^[A-Za-z0-9_.-]+$/.test(repo)) return null
    return { owner, repo }
  } catch {
    return null
  }
}

export function githubUrl(ref) {
  return `https://github.com/${ref.owner}/${ref.repo}`
}

export function runPageUrl(ref) {
  const base = `/run/${encodeURIComponent(ref.owner)}/${encodeURIComponent(ref.repo)}`
  const root = aliasRoot(ref.root)
  if (!root) return base
  return `${base}/${root.split("/").map(encodeURIComponent).join("/")}`
}

/**
 * Start a Run job. Returns one of:
 *   { status: "queued", jobId }          — build underway, poll/SSE via watchJob
 *   { status: "ok", url, editToken }     — instant static deploy
 *   { status: "pick_root", ref, roots }  — repo has more than one app
 *   { status: "error", reason }          — failed (rate_limited retried)
 */
export async function runGithubRepo(owner, repo, root) {
  const ref = { owner, repo, root }
  const folder = aliasRoot(root || ref.root)
  const at = folder ? { ...ref, root: folder } : { owner: ref.owner, repo: ref.repo }
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(`${RUN_API}/v1/repo/deploy`, {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json", "X-Aft-Client": "web" },
      body: JSON.stringify({ url: githubUrl(at), ...(folder ? { root: folder } : {}) }),
    })
    const data = await res.json().catch(() => ({}))
    if (res.status === 202 && data.jobId) {
      return { status: "queued", jobId: data.jobId }
    }
    if (res.ok && data.url) {
      return { status: "ok", url: data.url, editToken: data.editToken }
    }
    if (data.error === "pick_root" && Array.isArray(data.roots) && data.roots.length) {
      return { status: "pick_root", ref: at, roots: data.roots }
    }
    const rateLimited =
      data.error === "rate_limited" ||
      /rate-limited/i.test(String(data.reason || ""))
    if (rateLimited && attempt === 0) {
      await new Promise((resolve) => setTimeout(resolve, 3000))
      continue
    }
    return {
      status: "error",
      reason: data.reason || data.message || data.error || `Run failed (${res.status})`,
    }
  }
  return { status: "error", reason: "Run failed" }
}

export async function waitForSite(url, { timeoutMs = 45000, intervalMs = 1000 } = {}) {
  const probe = new URL(url).origin + "/"
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const res = await fetch(probe, { cache: "no-store" })
      if (res.ok) return true
      // Build still running or KV catching up — keep waiting.
      if (res.status === 202 || res.status === 404) {
        await new Promise((resolve) => setTimeout(resolve, intervalMs))
        continue
      }
      return false
    } catch (_) {}
    await new Promise((resolve) => setTimeout(resolve, intervalMs))
  }
  return false
}

/**
 * Watch a queued job until it settles. Event-driven so any host can render.
 * callbacks: onSnap(snap, turns), onLive(snap, turns), onFail(snap, turns),
 *            onTimeout(), onStop?()
 * settings: deadlineMs, intervalMs, signal (AbortController)
 */
export async function watchJob(
  jobId,
  { onSnap, onLive, onFail, onTimeout, deadlineMs = 12 * 60 * 1000, intervalMs = 2000, signal } = {},
) {
  const url = `${RUN_API}/v1/jobs/${encodeURIComponent(jobId)}`
  let settled = false
  let lastTail = ""

  const paint = (snap) => {
    if (typeof snap.logTail === "string" && snap.logTail) lastTail = snap.logTail
    else if (snap.line) {
      const line = scrubSurface(snap.line)
      if (line) lastTail = lastTail ? `${lastTail}\n${line}` : line
    }
    const turns = classifyLog(lastTail)
    if (onSnap) onSnap(snap, turns)
  }

  const applySnap = async (snap) => {
    if (settled || !snap || snap.error === "not_found") return
    paint(snap)
    if (snap.status === "live" && snap.url) {
      settled = true
      if (onLive) {
        await onLive(snap, classifyLog(lastTail))
      }
      return
    }
    if (snap.status === "failed") {
      settled = true
      const why = scrubSurface(snap.reason || snap.error || "Build failed.") || "Build failed."
      if (onFail) onFail(snap, classifyLog(lastTail), why)
    }
  }

  const es = new EventSource(`${url}/events`, { withCredentials: true })
  es.onmessage = (ev) => {
    try {
      applySnap(JSON.parse(ev.data)).catch(() => {})
    } catch (_) {}
  }
  if (signal) {
    signal.addEventListener("abort", () => es.close())
  }

  const deadline = Date.now() + deadlineMs
  while (!settled && Date.now() < deadline && !(signal && signal.aborted)) {
    try {
      const r = await fetch(url, { credentials: "include" })
      const snap = await r.json().catch(() => ({}))
      await applySnap(snap)
    } catch (_) {}
    if (settled || (signal && signal.aborted)) break
    await new Promise((resolve) => setTimeout(resolve, intervalMs))
  }
  es.close()
  if (!settled) {
    if (onTimeout) {
      await onTimeout(jobId, url)
    }
  }
  return { settled }
}