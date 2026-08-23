const API = "https://api.aft.page"

const PHASE_LABEL = {
  queued: "Queued",
  cloning: "Cloning repo",
  installing: "Installing packages",
  building: "Building",
  deploying: "Deploying",
  live: "Live",
  failed: "Failed",
}

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

function parseRunPath() {
  const parts = location.pathname.replace(/\/+$/, "").split("/").filter(Boolean)
  if (parts[0] !== "run" || parts.length < 3) return null
  const owner = decodeURIComponent(parts[1] || "")
  const repo = decodeURIComponent(parts[2] || "").replace(/\.git$/i, "")
  if (!owner || !repo || SKIP_OWNERS.has(owner.toLowerCase())) return null
  if (!/^[A-Za-z0-9_.-]+$/.test(owner) || !/^[A-Za-z0-9_.-]+$/.test(repo)) return null
  return { owner, repo }
}

function parseGithubInput(raw) {
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

function githubUrl(ref) {
  return `https://github.com/${ref.owner}/${ref.repo}`
}

function runPageUrl(ref) {
  return `/run/${encodeURIComponent(ref.owner)}/${encodeURIComponent(ref.repo)}`
}

function liveOpenUrl(liveUrl, editToken) {
  if (!liveUrl) return null
  const u = new URL(liveUrl)
  if (editToken) u.searchParams.set("token", editToken)
  return u.toString()
}

function setStatus(text, kind = "pending") {
  const el = document.getElementById("status")
  el.textContent = text || ""
  el.className = `msg ${kind}`
}

function showRepo(ref) {
  const chip = document.getElementById("repo-chip")
  chip.hidden = false
  chip.textContent = `${ref.owner}/${ref.repo}`
  document.getElementById("git-url").value = githubUrl(ref)
  document.getElementById("run-title").textContent = `Running ${ref.owner}/${ref.repo}`
}

async function watchJob(data) {
  const panel = document.getElementById("build-panel")
  const phaseEl = document.getElementById("build-phase")
  const logEl = document.getElementById("build-log")
  const liveRow = document.getElementById("live-row")
  const liveLink = document.getElementById("live-link")
  panel.hidden = false
  logEl.textContent = ""
  liveRow.hidden = true

  const kindLabel = data.kind === "vite" ? "Vite" : data.kind === "next" ? "Next.js" : "Static"
  const repoLabel = data.owner && data.repo ? `${data.owner}/${data.repo}` : "repo"
  setStatus(`Building ${kindLabel} for ${repoLabel}…`, "pending")
  phaseEl.textContent = PHASE_LABEL.queued
  let settled = false

  const finishLive = (snap) => {
    settled = true
    phaseEl.textContent = PHASE_LABEL.live
    setStatus("Live.", "ok")
    const dest = liveOpenUrl(snap.url, snap.editToken)
    if (dest) {
      liveLink.href = dest
      liveLink.textContent = dest
      liveRow.hidden = false
      window.setTimeout(() => {
        location.replace(dest)
      }, 600)
    }
  }

  const applySnap = async (snap) => {
    if (settled || !snap || snap.error === "not_found") return
    if (snap.phase) phaseEl.textContent = PHASE_LABEL[snap.phase] || snap.phase
    if (typeof snap.logTail === "string" && snap.logTail) logEl.textContent = snap.logTail
    else if (snap.line) {
      logEl.textContent = logEl.textContent ? `${logEl.textContent}\n${snap.line}` : snap.line
    }
    logEl.scrollTop = logEl.scrollHeight
    if (snap.status === "live" && snap.url) {
      finishLive(snap)
      return
    }
    if (snap.status === "failed") {
      settled = true
      phaseEl.textContent = PHASE_LABEL.failed
      const why = snap.reason || snap.error || "Build failed."
      setStatus(why, "err")
      if (snap.logTail) logEl.textContent = snap.logTail
    }
  }

  const es = new EventSource(`${API}/v1/jobs/${encodeURIComponent(data.jobId)}/events`)
  es.onmessage = (ev) => {
    try {
      applySnap(JSON.parse(ev.data))
    } catch (_) {}
  }

  const deadline = Date.now() + 12 * 60 * 1000
  while (!settled && Date.now() < deadline) {
    try {
      const r = await fetch(`${API}/v1/jobs/${encodeURIComponent(data.jobId)}`)
      const snap = await r.json().catch(() => ({}))
      await applySnap(snap)
    } catch (_) {}
    if (settled) break
    await new Promise((resolve) => setTimeout(resolve, 2000))
  }
  es.close()
  if (!settled) setStatus("Build timed out. Try again or pick a smaller repo.", "err")
}

async function runRepo(ref, { pushState = false } = {}) {
  const go = document.getElementById("git-go")
  go.disabled = true
  showRepo(ref)
  if (pushState) history.replaceState(null, "", runPageUrl(ref))

  setStatus("Checking repo…", "pending")
  try {
    const res = await fetch(`${API}/v1/repo/deploy`, {
      method: "POST",
      headers: { "content-type": "application/json", "X-Aft-Client": "web" },
      body: JSON.stringify({ url: githubUrl(ref) }),
    })
    const data = await res.json().catch(() => ({}))
    if (res.status === 202 && data.jobId) {
      await watchJob(data)
      return
    }
    if (!res.ok || !data.url) {
      setStatus(data.reason || data.message || data.error || `Run failed (${res.status})`, "err")
      return
    }
    setStatus("Live.", "ok")
    const dest = liveOpenUrl(data.url, data.editToken)
    if (dest) location.replace(dest)
  } finally {
    go.disabled = false
  }
}

document.getElementById("git-form").addEventListener("submit", (e) => {
  e.preventDefault()
  const ref = parseGithubInput(document.getElementById("git-url").value)
  if (!ref) {
    setStatus("Paste a public GitHub URL or owner/repo.", "err")
    return
  }
  runRepo(ref, { pushState: true })
})

const fromPath = parseRunPath()
if (fromPath) runRepo(fromPath)
