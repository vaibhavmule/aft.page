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

function liveOpenUrl(liveUrl, editToken, claimUrl) {
  if (claimUrl) return claimUrl
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

async function waitForSite(url, { timeoutMs = 45000, intervalMs = 1000 } = {}) {
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

async function showLive(liveUrl, editToken) {
  const dest = liveOpenUrl(liveUrl, editToken, null)
  if (!dest) {
    setStatus("Live, but no URL returned.", "err")
    return
  }
  setStatus("Almost ready…", "pending")
  await waitForSite(liveUrl)
  const card = document.getElementById("live-card")
  const open = document.getElementById("live-open")
  const urlText = document.getElementById("live-url-text")
  document.getElementById("git-form").hidden = true
  open.href = dest
  urlText.textContent = dest
  card.hidden = false
  setStatus("Your app is live. Open it when you’re ready.", "ok")
}

async function watchJob(data) {
  const panel = document.getElementById("build-panel")
  const phaseEl = document.getElementById("build-phase")
  const logEl = document.getElementById("build-log")
  panel.hidden = false
  logEl.textContent = ""

  const kindLabel = data.kind === "vite" ? "Vite" : data.kind === "next" ? "Next.js" : "Static"
  const repoLabel = data.owner && data.repo ? `${data.owner}/${data.repo}` : "repo"
  setStatus(`Building ${kindLabel} for ${repoLabel}…`, "pending")
  phaseEl.textContent = PHASE_LABEL.queued
  let settled = false

  const finishLive = async (snap) => {
    settled = true
    phaseEl.textContent = "Going live…"
    await showLive(snap.url, snap.editToken)
    phaseEl.textContent = PHASE_LABEL.live
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
      await finishLive(snap)
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
      applySnap(JSON.parse(ev.data)).catch(() => {})
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

  for (let attempt = 0; attempt < 2; attempt++) {
    setStatus(attempt ? "Retrying…" : "Checking repo…", "pending")
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
      if (res.ok && data.url) {
        await showLive(data.url, data.editToken)
        return
      }
      const rateLimited =
        data.error === "rate_limited" ||
        /rate-limited/i.test(String(data.reason || ""))
      if (rateLimited && attempt === 0) {
        await new Promise((resolve) => setTimeout(resolve, 3000))
        continue
      }
      setStatus(data.reason || data.message || data.error || `Run failed (${res.status})`, "err")
      return
    } finally {
      go.disabled = false
    }
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
if (fromPath) runRepo(fromPath, { pushState: true })
