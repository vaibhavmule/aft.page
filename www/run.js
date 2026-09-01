import { classifyLog, headlineFor, scrubSurface } from "./run-log.mjs"

const API = "https://api.aft.page"

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

function aliasRoot(raw) {
  const s = String(raw || "").replace(/\\/g, "/").replace(/^\/+|\/+$/g, "")
  if (!s || s.includes("..")) return ""
  const lower = s.toLowerCase()
  if (lower === "front-end" || lower === "front_end") return "frontend"
  if (lower === "back-end" || lower === "back_end") return "backend"
  return s
}

function parseRunPath() {
  const parts = location.pathname.replace(/\/+$/, "").split("/").filter(Boolean)
  if (parts[0] !== "run" || parts.length < 3) return null
  const owner = decodeURIComponent(parts[1] || "")
  const repo = decodeURIComponent(parts[2] || "").replace(/\.git$/i, "")
  if (!owner || !repo || SKIP_OWNERS.has(owner.toLowerCase())) return null
  if (!/^[A-Za-z0-9_.-]+$/.test(owner) || !/^[A-Za-z0-9_.-]+$/.test(repo)) return null
  const rest = parts.slice(3).map((p) => decodeURIComponent(p)).join("/")
  const root = aliasRoot(rest)
  return root ? { owner, repo, root } : { owner, repo }
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
  const base = `/run/${encodeURIComponent(ref.owner)}/${encodeURIComponent(ref.repo)}`
  const root = aliasRoot(ref.root)
  if (!root) return base
  return `${base}/${root.split("/").map(encodeURIComponent).join("/")}`
}

function liveOpenUrl(liveUrl, editToken, claimUrl) {
  if (claimUrl) return claimUrl
  if (!liveUrl) return null
  const u = new URL(liveUrl)
  if (editToken) u.searchParams.set("token", editToken)
  return u.toString()
}

function askNotify() {
  if (!("Notification" in window)) return
  if (Notification.permission === "default") {
    Notification.requestPermission().catch(() => {})
  }
}

function notifyDone(title, body) {
  if (!("Notification" in window) || Notification.permission !== "granted") return
  try {
    new Notification(title, { body: body || "", icon: "/favicon-32.png" })
  } catch (_) {}
}

const FETCH_CREDS = { credentials: "include" }
const VIEW_KEY = "aftRunView"

let paintedTurns = []

function wantedView() {
  const q = new URLSearchParams(location.search).get("detail")
  if (q === "1" || q === "true") return "details"
  try {
    const saved = localStorage.getItem(VIEW_KEY)
    if (saved === "details" || saved === "simple") return saved
  } catch (_) {}
  return "simple"
}

function applyView(view) {
  const v = view === "details" ? "details" : "simple"
  document.body.dataset.runView = v
  const simpleBtn = document.getElementById("view-simple")
  const detailBtn = document.getElementById("view-detail")
  if (simpleBtn) simpleBtn.setAttribute("aria-pressed", v === "simple" ? "true" : "false")
  if (detailBtn) detailBtn.setAttribute("aria-pressed", v === "details" ? "true" : "false")
  try {
    localStorage.setItem(VIEW_KEY, v)
  } catch (_) {}
}

function handleViewSimple() {
  applyView("simple")
  renderTurns(paintedTurns)
}

function handleViewDetail() {
  applyView("details")
  renderTurns(paintedTurns)
}

function renderTurns(turns) {
  paintedTurns = turns
  const list = document.getElementById("turn-list")
  if (!list) return
  const frag = document.createDocumentFragment()
  turns.forEach((turn, i) => {
    const li = document.createElement("li")
    if (i === turns.length - 1) li.className = "now"
    const dot = document.createElement("span")
    dot.className = "dot"
    dot.setAttribute("aria-hidden", "true")
    const wrap = document.createElement("div")
    const label = document.createElement("div")
    label.className = "turn-label"
    const details = document.body.dataset.runView === "details"
    label.textContent = details ? turn.detail : turn.simple
    wrap.appendChild(label)
    const extra = String(turn.guts || "").trim()
    if (extra && extra !== turn.simple && extra !== turn.detail) {
      const guts = document.createElement("pre")
      guts.className = "turn-guts"
      guts.textContent = extra
      wrap.appendChild(guts)
    }
    li.appendChild(dot)
    li.appendChild(wrap)
    frag.appendChild(li)
  })
  list.replaceChildren(frag)
  const last = list.lastElementChild
  if (last) last.scrollIntoView({ block: "nearest" })
}

function setStatus(text, kind = "pending") {
  const el = document.getElementById("status")
  const docs = document.getElementById("status-docs")
  el.textContent = text || ""
  el.className = `msg ${kind}`
  const dbFail =
    kind === "err" &&
    /postgres|mysql|sqlite|database_url|real database/i.test(String(text || ""))
  if (docs) docs.hidden = !dbFail
}

function showRepo(ref) {
  const chip = document.getElementById("repo-chip")
  chip.hidden = false
  const root = aliasRoot(ref.root)
  chip.textContent = root ? `${ref.owner}/${ref.repo}/${root}` : `${ref.owner}/${ref.repo}`
  document.getElementById("git-url").value = githubUrl(ref)
  document.getElementById("run-title").textContent = root
    ? `Running ${ref.owner}/${ref.repo}/${root}`
    : `Running ${ref.owner}/${ref.repo}`
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
  notifyDone("Live on aft.page", dest)
}

async function watchJob(data) {
  const panel = document.getElementById("build-panel")
  const phaseEl = document.getElementById("build-phase")
  const listEl = document.getElementById("turn-list")
  const stopBtn = document.getElementById("run-stop")
  const gitUrl = document.getElementById("git-url")
  panel.hidden = false
  listEl.replaceChildren()
  applyView(wantedView())
  askNotify()
  if (stopBtn) {
    stopBtn.hidden = false
    stopBtn.disabled = false
  }

  const kindLabel =
    data.kind === "vite" || data.kind === "static_build"
      ? "Static build"
      : data.kind === "next"
        ? "Next.js"
        : data.kind === "container"
          ? data.stack || "App"
          : "Static"
  const repoLabel = data.owner && data.repo ? `${data.owner}/${data.repo}` : "repo"
  setStatus(`Building ${kindLabel} for ${repoLabel}…`, "pending")
  phaseEl.textContent = headlineFor("queued", "queued", [])
  let settled = false
  let lastTail = ""
  let es

  const hideStop = () => {
    if (!stopBtn) return
    stopBtn.hidden = true
    stopBtn.disabled = false
  }

  const paint = (snap) => {
    if (typeof snap.logTail === "string" && snap.logTail) lastTail = snap.logTail
    else if (snap.line) {
      const line = scrubSurface(snap.line)
      if (line) lastTail = lastTail ? `${lastTail}\n${line}` : line
    }
    const turns = classifyLog(lastTail)
    renderTurns(turns)
    phaseEl.textContent = headlineFor(snap.phase, snap.status, turns)
  }

  const finishLive = async (snap) => {
    settled = true
    hideStop()
    phaseEl.textContent = "Going live…"
    await showLive(snap.url, snap.editToken)
    phaseEl.textContent = headlineFor("live", "live", classifyLog(lastTail))
  }

  const applySnap = async (snap) => {
    if (settled || !snap || snap.error === "not_found") return
    paint(snap)
    if (snap.status === "live" && snap.url) {
      await finishLive(snap)
      return
    }
    if (snap.status === "failed") {
      settled = true
      hideStop()
      phaseEl.textContent = "Failed"
      const why = scrubSurface(snap.reason || snap.error || "Build failed.") || "Build failed."
      setStatus(why, "err")
      if (snap.logTail) {
        lastTail = snap.logTail
        const turns = classifyLog(lastTail).filter(
          (t) => t.simple !== why && t.detail !== why && t.guts !== why,
        )
        renderTurns(turns)
      }
      notifyDone("Run failed", why)
    }
  }

  const handleStop = async () => {
    if (settled || !stopBtn) return
    stopBtn.disabled = true
    try {
      await fetch(`${API}/v1/jobs/${encodeURIComponent(data.jobId)}/stop`, {
        method: "POST",
        credentials: "include",
      })
    } catch (_) {}
    settled = true
    if (es) es.close()
    hideStop()
    phaseEl.textContent = "Stopped"
    setStatus("Stopped. Change the repo and Run again.", "pending")
    gitUrl.focus()
    gitUrl.select()
  }

  es = new EventSource(`${API}/v1/jobs/${encodeURIComponent(data.jobId)}/events`, {
    withCredentials: true,
  })
  es.onmessage = (ev) => {
    try {
      applySnap(JSON.parse(ev.data)).catch(() => {})
    } catch (_) {}
  }
  stopBtn?.addEventListener("click", handleStop)

  const deadline = Date.now() + 12 * 60 * 1000
  while (!settled && Date.now() < deadline) {
    try {
      const r = await fetch(`${API}/v1/jobs/${encodeURIComponent(data.jobId)}`, FETCH_CREDS)
      const snap = await r.json().catch(() => ({}))
      await applySnap(snap)
    } catch (_) {}
    if (settled) break
    await new Promise((resolve) => setTimeout(resolve, 2000))
  }
  es.close()
  stopBtn?.removeEventListener("click", handleStop)
  hideStop()
  if (!settled) {
    setStatus("Build timed out. Try again or pick a smaller repo.", "err")
    notifyDone("Run timed out", "Try again or pick a smaller repo.")
  }
}

function hideRootPicker() {
  const picker = document.getElementById("root-picker")
  const choices = document.getElementById("root-choices")
  picker.hidden = true
  choices.replaceChildren()
}

function showRootPicker(ref, roots) {
  const picker = document.getElementById("root-picker")
  const choices = document.getElementById("root-choices")
  hideRootPicker()
  roots.forEach((r) => {
    const btn = document.createElement("button")
    btn.type = "button"
    btn.className = "btn"
    btn.textContent = `${r.path} (${r.stack || r.kind})`
    btn.setAttribute("aria-label", `Run ${r.path}`)
    btn.addEventListener("click", () => {
      hideRootPicker()
      runRepo({ ...ref, root: r.path }, { pushState: true, root: r.path })
    })
    choices.appendChild(btn)
  })
  picker.hidden = false
  setStatus("Pick a folder — frontend is the UI, backend is the API.", "pending")
}

async function runRepo(ref, { pushState = false, root } = {}) {
  const folder = aliasRoot(root || ref.root)
  const at = folder ? { ...ref, root: folder } : { owner: ref.owner, repo: ref.repo }
  const go = document.getElementById("git-go")
  const panel = document.getElementById("build-panel")
  const live = document.getElementById("live-card")
  go.disabled = true
  if (panel) panel.hidden = true
  if (live) live.hidden = true
  askNotify()
  showRepo(at)
  hideRootPicker()
  if (pushState) history.replaceState(null, "", runPageUrl(at))

  for (let attempt = 0; attempt < 2; attempt++) {
    setStatus(attempt ? "Retrying…" : "Checking repo…", "pending")
    try {
      const res = await fetch(`${API}/v1/repo/deploy`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json", "X-Aft-Client": "web" },
        body: JSON.stringify({ url: githubUrl(at), ...(folder ? { root: folder } : {}) }),
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
      if (data.error === "pick_root" && Array.isArray(data.roots) && data.roots.length) {
        showRootPicker(ref, data.roots)
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

document.getElementById("view-simple").addEventListener("click", handleViewSimple)
document.getElementById("view-detail").addEventListener("click", handleViewDetail)
applyView(wantedView())

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
if (fromPath) runRepo(fromPath, { pushState: true, root: fromPath.root })
