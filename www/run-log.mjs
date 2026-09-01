/** Classify + scrub Run job logTail for /run/. No vendor or model names. */

const BANNED =
  /cloudflare|wrangler|sandbox|glm|grok|\bopennext\b|trycloudflare|ai gateway|\bllm\b|durable object|workers\.dev|container image|@cf\/|zai-org|workers ai/i

export function scrubSurface(s) {
  const raw = String(s || "")
  if (BANNED.test(raw) || /\b(AI|LLM|GLM|Grok)\b/i.test(raw)) return ""
  return raw
    .replace(/opennextjs-cloudflare/gi, "next build")
    .replace(/@opennextjs\/\S+/gi, "next")
    .replace(/\bOpenNext\b/gi, "Next.js")
    .replace(/trycloudflare\.com/gi, "aft.page")
    .replace(/ {2,}/g, " ")
    .trim()
}

function isPipNoise(line) {
  return (
    /WARNING: Running pip/i.test(line) ||
    /Downloading /.test(line) ||
    /Collecting /.test(line) ||
    /Installing collected packages/.test(line) ||
    /Successfully installed/.test(line) ||
    /^\s*━/.test(line) ||
    /eta 0:/.test(line) ||
    /\d+(\.\d+)?\s?(kB|MB|GB)\/s/.test(line)
  )
}

function isInstallLine(line) {
  return (
    /^(python3 -m pip|pip3? |npm |pnpm |yarn )/.test(line) ||
    /^install done$/i.test(line) ||
    /manage\.py migrate/.test(line) ||
    /^Operations to perform/.test(line) ||
    /^Running migrations/.test(line) ||
    /^No migrations to apply/.test(line) ||
    /^Apply all migrations/.test(line) ||
    /^UI: /.test(line)
  )
}

function addGuts(turns, kind, simple, detail, line) {
  const last = turns[turns.length - 1]
  if (last && last.kind === kind) {
    if (line) last.guts = last.guts ? `${last.guts}\n${line}` : line
    if (detail) last.detail = detail
    return
  }
  turns.push({ kind, simple, detail: detail || simple, guts: line || "" })
}

export function classifyLog(tail) {
  const lines = String(tail || "")
    .split("\n")
    .map(scrubSurface)
    .filter(Boolean)
  const turns = []
  for (const line of lines) {
    if (/^Clon(ing|ed) /.test(line)) {
      const repo = line.replace(/^Clon(?:ing|ed) /, "")
      addGuts(turns, "clone", "Getting the repo", `Getting the repo · ${repo}`, "")
      continue
    }
    if (line === "Planning" || line === "Patching") {
      addGuts(turns, "prepare", "Preparing the app", "Preparing the app", "")
      continue
    }
    if (line === "Checking") {
      addGuts(turns, "check", "Checking", "Checking", "")
      continue
    }
    if (line === "No patches") {
      addGuts(turns, "note", "No patches", "No patches", "")
      continue
    }
    if (/^Starting /.test(line) || line === "Publishing") {
      addGuts(turns, "start", "Starting the app", line, "")
      continue
    }
    if (isPipNoise(line) || isInstallLine(line)) {
      addGuts(turns, "install", "Installing packages", "Installing packages", line)
      continue
    }
    if (line.length > 240) {
      addGuts(turns, "install", "Installing packages", "Installing packages", line)
      continue
    }
    addGuts(turns, "note", line, line, "")
  }
  return turns
}

export function headlineFor(phase, status, turns) {
  if (status === "failed" || phase === "failed") return "Failed"
  if (status === "live" || phase === "live") return "Live"
  const last = turns && turns.length ? turns[turns.length - 1] : null
  if (last) {
    if (last.kind === "clone") return "Getting the code"
    if (last.kind === "prepare" || last.kind === "check" || last.kind === "note") return "Preparing"
    if (last.kind === "install") return "Installing"
    if (last.kind === "start") return "Starting"
  }
  if (phase === "queued") return "Queued"
  if (phase === "cloning") return "Getting the code"
  if (phase === "installing") return "Installing"
  if (phase === "building") return "Starting"
  if (phase === "deploying") return "Going live"
  return "Queued"
}
