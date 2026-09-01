/** /code/ — prompt or template → HTML → deploy → /project */
(function () {
  const API = "https://api.aft.page"
  const RESERVED = new Set([
    "www", "api", "app", "mail", "ftp", "cdn", "static", "admin",
    "dashboard", "status", "ops", "docs", "login", "mcp", "drop",
    "code", "cname", "aft", "aft-page", "ai", "cron", "job", "jobs",
    "schedule", "schedules", "automation", "automations", "brief",
    "plugin", "plugins", "claim", "auth", "preview", "blog", "help",
    "support",
  ])

  const form = document.getElementById("prompt-form")
  const promptEl = document.getElementById("prompt")
  const promptGo = document.getElementById("prompt-go")
  const pills = document.querySelector(".pills")
  const statusEl = document.getElementById("status")
  const pillButtons = pills ? Array.from(pills.querySelectorAll("[data-template]")) : []

  const isValidSlug = (slug) =>
    /^[a-z0-9](?:[a-z0-9-]{0,46}[a-z0-9])?$/.test(slug)

  const setStatus = (text, kind) => {
    statusEl.textContent = text
    statusEl.className = "msg" + (kind ? " " + kind : "")
  }

  const setBusy = (busy) => {
    promptGo.disabled = busy
    pillButtons.forEach((b) => { b.disabled = busy })
  }

  const isLocalDev = () =>
    Boolean(window.aftAuth?.isLocalDev?.()) ||
    location.hostname === "localhost" ||
    location.hostname === "127.0.0.1"

  const goLogin = () => {
    if (isLocalDev()) return
    const next = location.pathname + location.search
    if (window.aftAuth?.goLogin) {
      window.aftAuth.goLogin(next)
      return
    }
    location.replace("/login?next=" + encodeURIComponent(next))
  }

  const slugFromHtml = (html) => {
    const title = html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim()
    const h1 = html.match(/<h1[^>]*>([^<]+)<\/h1>/i)?.[1]?.trim()
    const raw = (title || h1 || "").toLowerCase()
    if (!raw) return undefined
    const slug = raw
      .normalize("NFKD")
      .replace(/[^\w\s-]/g, "")
      .trim()
      .replace(/[\s_]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48)
    if (!slug || slug.length < 2 || RESERVED.has(slug) || !isValidSlug(slug)) {
      return undefined
    }
    return slug
  }

  const deployHtml = (html) => {
    const slug = slugFromHtml(html)
    const endpoint = slug
      ? `${API}/v1/deploy?slug=${encodeURIComponent(slug)}`
      : `${API}/v1/deploy`
    return fetch(endpoint, {
      method: "POST",
      credentials: "include",
      headers: {
        "content-type": "text/html; charset=utf-8",
        "X-Aft-Client": "web",
      },
      body: html,
    })
  }

  const finishCreated = async (data) => {
    if (data.editToken) {
      try {
        const map = JSON.parse(localStorage.getItem("aft.editTokens") || "{}")
        map[data.slug] = data.editToken
        localStorage.setItem("aft.editTokens", JSON.stringify(map))
      } catch (_) {}
    }
    setStatus("Setting visibility…", "pending")
    if (!isLocalDev()) {
      const visRes = await fetch(`${API}/v1/sites/${encodeURIComponent(data.slug)}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ visibility: "private" }),
      })
      if (!visRes.ok) {
        setStatus(
          "Project created, but couldn’t set private — you can change it on the next page.",
          "err",
        )
        await new Promise((r) => setTimeout(r, 1200))
      }
    }
    setStatus("Created. Opening…", "ok")
    const live = data.url || `https://${data.slug}.aft.page`
    window.location.href = isLocalDev()
      ? live
      : `/project/?slug=${encodeURIComponent(data.slug)}`
  }

  const ensureLogin = async () => {
    if (isLocalDev()) return true
    const auth = window.aftAuth
    if (!auth?.getMe) {
      goLogin()
      return false
    }
    const user = await auth.getMe()
    if (!user) {
      goLogin()
      return false
    }
    return true
  }

  const generateAndDeploy = async ({ prompt, template }) => {
    if (!(await ensureLogin())) return
    setStatus(template ? "Loading template…" : "Generating…", "pending")
    const res = await fetch(`${API}/v1/code/generate`, {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json", "X-Aft-Client": "web" },
      body: JSON.stringify(template ? { template } : { prompt }),
    })
    const data = await res.json().catch(() => ({}))
    if (res.status === 401 || data.error === "unauthorized") {
      if (isLocalDev()) {
        setStatus("Prompts need a session on api.aft.page — try a template.", "err")
        return
      }
      goLogin()
      return
    }
    if (!res.ok || !data.html) {
      const msg =
        data.error === "ai_unavailable"
          ? "Generator isn’t on this Worker yet — try a template."
          : data.error === "rate_limited"
            ? "Too many generates. Try again in a bit."
            : data.message || data.error || `Generate failed (${res.status})`
      setStatus(msg, "err")
      return
    }
    setStatus("Publishing…", "pending")
    const up = await deployHtml(data.html)
    const out = await up.json().catch(() => ({}))
    if (!up.ok || !out.slug) {
      setStatus(out.message || out.error || `Deploy failed (${up.status})`, "err")
      return
    }
    await finishCreated(out)
  }

  const runBusy = async (fn) => {
    setBusy(true)
    if (window.AftProgress) window.AftProgress.start()
    try {
      await fn()
    } finally {
      if (window.AftProgress) window.AftProgress.done()
      setBusy(false)
    }
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault()
    const value = promptEl.value.trim()
    if (!value) {
      setStatus("Describe a site, or pick a template.", "err")
      return
    }
    runBusy(() => generateAndDeploy({ prompt: value }))
  })

  pills.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-template]")
    if (!btn) return
    runBusy(() => generateAndDeploy({ template: btn.dataset.template }))
  })
})()
