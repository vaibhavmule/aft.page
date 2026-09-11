import {
  aliasRoot,
  githubUrl,
  headlineFor,
  parseGithubInput,
  parseRunPath,
  runGithubRepo,
  runPageUrl,
  waitForSite,
  watchJob,
} from "./run-client.js"

const API = "https://api.aft.page"

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

async function watchJobUi(data) {
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
  const controller = new AbortController()

  const hideStop = () => {
    if (!stopBtn) return
    stopBtn.hidden = true
    stopBtn.disabled = false
  }

  const onStop = async () => {
    if (settled || !stopBtn) return
    settled = true
    stopBtn.disabled = true
    controller.abort()
    try {
      await fetch(`${API}/v1/jobs/${encodeURIComponent(data.jobId)}/stop`, {
        method: "POST",
        credentials: "include",
        headers: data.stopToken
          ? { authorization: `Bearer ${data.stopToken}` }
          : {},
      })
    } catch (_) {}
    hideStop()
    phaseEl.textContent = "Stopped"
    setStatus("Stopped. Change the repo and Run again.", "pending")
    gitUrl.focus()
    gitUrl.select()
  }

  stopBtn?.addEventListener("click", onStop)

  await watchJob(data.jobId, {
    signal: controller.signal,
    onSnap: (snap, turns) => {
      phaseEl.textContent = headlineFor(snap.phase, snap.status, turns)
    },
    onLive: async (snap, turns) => {
      settled = true
      hideStop()
      phaseEl.textContent = "Going live…"
      await showLive(snap.url, snap.editToken)
      phaseEl.textContent = headlineFor("live", "live", turns)
    },
    onFail: (snap, turns, why) => {
      settled = true
      hideStop()
      phaseEl.textContent = "Failed"
      setStatus(why, "err")
      const cleanTurns = turns.filter(
        (t) => t.simple !== why && t.detail !== why && t.guts !== why,
      )
      renderTurns(cleanTurns)
      notifyDone("Run failed", why)
    },
    onTimeout: async () => {
      if (settled) return
      settled = true
      hideStop()
      setStatus("Build timed out. Try again or pick a smaller repo.", "err")
      notifyDone("Run timed out", "Try again or pick a smaller repo.")
    },
  })
  if (settled) stopBtn?.removeEventListener("click", onStop)
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

  const res = await runGithubRepo(at.owner, at.repo, at.root)
  if (res.status === "queued") {
    await watchJobUi(res)
    return
  }
  if (res.status === "ok") {
    await showLive(res.url, res.editToken)
    return
  }
  if (res.status === "pick_root") {
    showRootPicker(res.ref, res.roots)
    return
  }
  setStatus(res.reason, "err")
  go.disabled = false
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

const fromPath = parseRunPath(location.pathname)
if (fromPath) runRepo(fromPath, { pushState: true, root: fromPath.root })