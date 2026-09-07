/**
 * Homepage hero Run tab — imports the shared run client and wires the inline
 * GitHub repo → live URL flow (mirrors the /run/ page, no duplicated pipeline).
 */
import {
  parseGithubInput,
  runGithubRepo,
  runPageUrl,
  waitForSite,
  watchJob,
} from "./run-client.js"

const form = document.getElementById("hero-run-form")
const input = document.getElementById("hero-run-url")
const go = document.getElementById("hero-run-go")
const statusEl = document.getElementById("hero-run-status")
const turnsEl = document.getElementById("hero-run-turns")
const liveEl = document.getElementById("hero-run-live")
const liveOpen = document.getElementById("hero-run-open")
const liveUrlText = document.getElementById("hero-run-url-text")
const liveFull = document.getElementById("hero-run-full")

if (form) {
  form.addEventListener("submit", async (e) => {
    e.preventDefault()
    const ref = parseGithubInput(input.value)
    if (!ref) {
      setStatus("Paste a public GitHub URL or owner/repo.", "err")
      return
    }
    startRun(ref)
  })
}

function setStatus(text, kind = "pending") {
  statusEl.textContent = text || ""
  statusEl.className = `hero-run-status ${kind}`
  statusEl.hidden = !text
}

function renderTurns(turns) {
  turnsEl.replaceChildren()
  turns.forEach((turn, i) => {
    const li = document.createElement("li")
    if (i === turns.length - 1) li.className = "now"
    const dot = document.createElement("span")
    dot.className = "dot"
    dot.setAttribute("aria-hidden", "true")
    const wrap = document.createElement("div")
    const label = document.createElement("div")
    label.textContent = turn.simple
    wrap.appendChild(label)
    const extra = String(turn.guts || "").trim()
    if (extra && extra !== turn.simple && extra !== turn.detail) {
      const guts = document.createElement("pre")
      guts.className = "hero-run-guts"
      guts.textContent = extra
      wrap.appendChild(guts)
    }
    li.appendChild(dot)
    li.appendChild(wrap)
    turnsEl.appendChild(li)
  })
  turnsEl.hidden = turns.length === 0
  turnsEl.setAttribute("aria-label", turns.length ? "Build progress" : "")
}

function showLive(dest) {
  liveOpen.href = dest
  liveUrlText.textContent = dest
  liveFull.hidden = true
  liveEl.hidden = false
}

function showFullLink(ref) {
  liveEl.hidden = true
  liveFull.href = runPageUrl(ref)
  liveFull.hidden = false
}

async function startRun(ref) {
  go.disabled = true
  statusEl.hidden = true
  liveEl.hidden = true
  liveFull.hidden = true
  setStatus("Checking repo…", "pending")

  const res = await runGithubRepo(ref.owner, ref.repo, ref.root)

  if (res.status === "queued") {
    await watchJob(res.jobId, {
      onSnap: (_snap, turns) => renderTurns(turns),
      onLive: async (snap, turns) => {
        renderTurns(turns)
        const dest = liveDestination(snap.url, snap.editToken)
        setStatus("Your app is live.", "ok")
        showLive(dest)
        go.disabled = false
      },
      onFail: (_snap, _turns, why) => {
        setStatus(why, "err")
        go.disabled = false
      },
      onTimeout: () => {
        setStatus("Build timed out. Try again or pick a smaller repo.", "err")
        go.disabled = false
      },
    })
    return
  }

  if (res.status === "ok") {
    const dest = liveDestination(res.url, res.editToken)
    setStatus("Almost ready…", "pending")
    await waitForSite(res.url)
    setStatus("Your app is live.", "ok")
    showLive(dest)
    go.disabled = false
    return
  }

  if (res.status === "pick_root") {
    setStatus(
      "This repo has more than one app — open the Run page to pick a folder.",
      "pending",
    )
    showFullLink(ref)
    go.disabled = false
    return
  }

  setStatus(res.reason, "err")
  go.disabled = false
}

function liveDestination(liveUrl, editToken) {
  if (!liveUrl) return null
  const u = new URL(liveUrl)
  if (editToken) u.searchParams.set("token", editToken)
  return u.toString()
}