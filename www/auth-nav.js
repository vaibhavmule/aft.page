/**
 * Shared post-login nav: profile chip + logout.
 * Mounts on [data-aft-auth="login"] (Log in links) → profile chip + logout.
 */
(function () {
  // Ensure top progress bar exists on every page that loads auth-nav.
  if (!window.AftProgress) {
    const s = document.createElement("script");
    s.src = "/progress.js";
    s.async = false;
    document.head.appendChild(s);
  }

  const API = "https://api.aft.page";

  function ensureStyles() {
    if (document.getElementById("aft-auth-nav-style")) return;
    const style = document.createElement("style");
    style.id = "aft-auth-nav-style";
    style.textContent = `
      @keyframes aft-spin {
        to { transform: rotate(360deg); }
      }
      @keyframes aft-fade-up {
        from { opacity: 0; transform: translateY(4px); }
        to { opacity: 1; transform: translateY(0); }
      }
      @keyframes aft-menu-in {
        from { opacity: 0; transform: translateY(-4px) scale(0.98); }
        to { opacity: 1; transform: translateY(0) scale(1); }
      }
      .aft-auth-loading {
        display: inline-flex; align-items: center; gap: 0.4rem;
        min-height: 1.9rem; padding: 0.2rem 0.55rem;
        color: inherit; opacity: 0.7; font-size: 0.82rem; font-weight: 550;
      }
      .aft-spinner {
        width: 0.85rem; height: 0.85rem; border-radius: 999px;
        border: 2px solid currentColor; border-right-color: transparent;
        animation: aft-spin 0.65s linear infinite; flex-shrink: 0;
      }
      .aft-auth-wrap {
        position: relative; display: inline-flex; align-items: center;
        animation: aft-fade-up 0.28s ease both;
      }
      .aft-auth-btn {
        display: inline-flex; align-items: center; justify-content: center;
        padding: 0.35rem 0.75rem; border: 1px solid var(--line, #27272a);
        border-radius: 0.5rem; background: transparent; color: inherit; font: inherit;
        font-weight: 550; cursor: pointer; text-decoration: none;
        transition: border-color 0.15s ease, transform 0.15s ease, box-shadow 0.15s ease;
      }
      .aft-auth-btn:hover { border-color: var(--line-bright, #3f3f46); }
      .aft-auth-btn:active { transform: scale(0.98); }
      .aft-auth-btn.is-busy { opacity: 0.65; pointer-events: none; }
      .aft-auth-avatar {
        width: 1.35rem; height: 1.35rem; border-radius: 0.5rem;
        background: var(--cta, #ffffff); color: var(--cta-ink, #000000); display: inline-flex;
        align-items: center; justify-content: center; font-size: 0.78rem;
        font-weight: 700; flex-shrink: 0;
        transition: transform 0.2s ease;
      }
      .aft-auth-btn[aria-expanded="true"] .aft-auth-avatar { transform: scale(1.06); }
      .aft-auth-menu {
        position: absolute; right: 0; top: calc(100% + 0.35rem);
        min-width: 12rem; background: var(--panel, #0a0a0a); border: 1px solid var(--line, #27272a);
        border-radius: 4px; box-shadow: 0 12px 32px rgba(0,0,0,0.45);
        padding: 0.35rem; z-index: 50; color: var(--ink, #fafafa);
        opacity: 0; visibility: hidden; pointer-events: none;
        transform: translateY(-4px) scale(0.98);
        transition: opacity 0.15s ease, transform 0.15s ease, visibility 0.15s;
      }
      .aft-auth-menu.open {
        opacity: 1; visibility: visible; pointer-events: auto;
        animation: aft-menu-in 0.16s ease both;
      }
      .aft-auth-menu-email {
        display: block; padding: 0.45rem 0.65rem 0.55rem;
        font-size: 0.75rem; font-weight: 500; color: var(--quiet, #a1a1aa);
        overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        border-bottom: 1px solid var(--line, #27272a);
        margin-bottom: 0.25rem;
      }
      .aft-auth-menu a, .aft-auth-menu button {
        display: block; width: 100%; text-align: left; border: 0; background: transparent;
        padding: 0.5rem 0.65rem; border-radius: 3px; font: inherit; font-size: 0.88rem;
        color: inherit; cursor: pointer; text-decoration: none; font-weight: 550;
        transition: background 0.12s ease;
      }
      .aft-auth-menu a:hover, .aft-auth-menu button:hover { background: rgba(255,255,255,0.06); }
      .aft-auth-menu button.is-busy {
        display: inline-flex; align-items: center; gap: 0.45rem; opacity: 0.75;
      }
      .topnav .aft-auth-btn {
        background: transparent; border-color: var(--line, rgba(255,255,255,0.14));
        color: inherit;
      }
      .topnav .aft-auth-avatar { background: var(--cta, #ffffff); color: var(--cta-ink, #000000); }
      .topnav .aft-auth-menu { background: #0a0a0a; border-color: var(--line, rgba(255,255,255,0.14)); color: #fafafa; }
      .topnav .aft-auth-menu-email {
        color: var(--quiet, #a1a1aa);
        border-bottom-color: var(--line, rgba(255,255,255,0.14));
      }
      .topnav .aft-auth-menu a:hover, .topnav .aft-auth-menu button:hover {
        background: rgba(255,255,255,0.06);
      }
      [data-aft-auth="guest"][hidden],
      [data-aft-auth="signed-in"][hidden] { display: none !important; }
      .bar .aft-auth-wrap { margin-left: 0.35rem; }
      @media (prefers-reduced-motion: reduce) {
        .aft-spinner, .aft-auth-wrap, .aft-auth-menu.open, .aft-auth-avatar {
          animation: none !important;
        }
        .aft-auth-btn, .aft-auth-menu, .aft-auth-menu a, .aft-auth-menu button {
          transition: none !important;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function initial(email) {
    const ch = (email || "?").trim().charAt(0).toUpperCase();
    return ch || "?";
  }

  function showSlotLoading(slots) {
    const loaders = [];
    for (const slot of slots) {
      const el = document.createElement("span");
      el.className = "aft-auth-loading";
      el.setAttribute("aria-busy", "true");
      el.setAttribute("aria-label", "Checking session");
      el.innerHTML = `<span class="aft-spinner" aria-hidden="true"></span>`;
      slot.replaceWith(el);
      loaders.push(el);
    }
    return loaders;
  }

  function hideSignedInCtas() {
    document.body.classList.add("aft-signed-in");
    for (const nav of document.querySelectorAll(".topnav, .docs-top, .seo-top, .bar, .drop-bar")) {
      nav.classList.add("aft-signed-in");
    }
    for (const el of document.querySelectorAll('[data-aft-auth="guest"]')) {
      el.hidden = true;
    }
    for (const el of document.querySelectorAll('[data-aft-auth="signed-in"]')) {
      el.hidden = false;
    }
  }

  function mountProfile(slot, user) {
    const wrap = document.createElement("div");
    wrap.className = "aft-auth-wrap";
    wrap.dataset.aftAuth = "profile";

    const email = user.email || "";
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "aft-auth-btn topnav-account";
    btn.setAttribute("aria-haspopup", "menu");
    btn.setAttribute("aria-expanded", "false");
    btn.setAttribute("aria-label", email ? `Account menu for ${email}` : "Account menu");
    btn.title = email;
    const avatar = document.createElement("span");
    avatar.className = "aft-auth-avatar";
    avatar.setAttribute("aria-hidden", "true");
    avatar.textContent = initial(email);
    btn.appendChild(avatar);

    const path = (window.location.pathname.replace(/\/$/, "") || "/");
    const onProjectsArea =
      path === "/projects" ||
      path === "/project" ||
      path.startsWith("/projects/") ||
      path.startsWith("/project/");

    const menu = document.createElement("div");
    menu.className = "aft-auth-menu";
    menu.setAttribute("role", "menu");
    if (email) {
      const emailEl = document.createElement("div");
      emailEl.className = "aft-auth-menu-email";
      emailEl.setAttribute("aria-hidden", "true");
      emailEl.textContent = email;
      menu.appendChild(emailEl);
    }
    if (!onProjectsArea) {
      const projects = document.createElement("a");
      projects.setAttribute("role", "menuitem");
      projects.href = "/projects";
      projects.textContent = "Projects";
      menu.appendChild(projects);
    }
    const logoutBtn = document.createElement("button");
    logoutBtn.type = "button";
    logoutBtn.setAttribute("role", "menuitem");
    logoutBtn.dataset.aftLogout = "";
    logoutBtn.textContent = "Log out";
    menu.appendChild(logoutBtn);

    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const open = !menu.classList.contains("open");
      menu.classList.toggle("open", open);
      btn.setAttribute("aria-expanded", open ? "true" : "false");
    });

    logoutBtn.addEventListener("click", async () => {
      logoutBtn.classList.add("is-busy");
      logoutBtn.disabled = true;
      logoutBtn.innerHTML =
        `<span class="aft-spinner" aria-hidden="true"></span> Logging out…`;
      btn.classList.add("is-busy");
      try {
        if (window.aftAuth) window.aftAuth.clearMe();
        await fetch(`${API}/v1/auth/logout`, {
          method: "POST",
          credentials: "include",
        });
      } catch {
        /* still reload */
      }
      window.location.reload();
    });

    document.addEventListener("click", () => {
      menu.classList.remove("open");
      btn.setAttribute("aria-expanded", "false");
    });

    wrap.appendChild(btn);
    wrap.appendChild(menu);
    slot.replaceWith(wrap);
  }

  function showGuest(loaders) {
    for (const loader of loaders) {
      const a = document.createElement("a");
      a.href = "/login";
      a.dataset.aftAuth = "login";
      a.textContent = "Log in";
      a.style.animation = "aft-fade-up 0.22s ease both";
      loader.replaceWith(a);
    }
  }

  function applyUser(loaders, user) {
    const path = window.location.pathname.replace(/\/$/, "") || "/";
    if (user && (path === "/login" || path.endsWith("/login"))) {
      window.location.replace("/projects");
      return true;
    }
    if (user) {
      hideSignedInCtas();
      for (const loader of loaders) mountProfile(loader, user);
    } else {
      showGuest(loaders);
    }
    return false;
  }

  async function init() {
    ensureStyles();
    const slots = [...document.querySelectorAll('[data-aft-auth="login"]')];
    const aftAuth = window.aftAuth;
    if (!aftAuth) {
      showGuest(showSlotLoading(slots));
      return;
    }

    const cached = aftAuth.peekMe();
    const loaders = showSlotLoading(slots);

    if (cached) {
      if (applyUser(loaders, cached)) return;
    }

    let user = null;
    try {
      user = await aftAuth.fetchMe();
    } catch {
      user = null;
    }

    if (cached) {
      if (!user) {
        for (const el of document.querySelectorAll('[data-aft-auth="profile"]')) {
          const a = document.createElement("a");
          a.href = "/login";
          a.dataset.aftAuth = "login";
          a.textContent = "Log in";
          el.replaceWith(a);
        }
      }
      return;
    }

    applyUser(loaders, user);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
