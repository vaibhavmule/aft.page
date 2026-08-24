/**
 * Shared public-site navigation.
 *
 * Every marketing page keeps a small semantic nav in its HTML as a no-script
 * fallback. This module upgrades that fallback to the canonical desktop rail,
 * Agents menu, and mobile drawer so the navigation cannot drift page by page.
 */
(function () {
  const OPEN_DELAY = 80;
  const CLOSE_DELAY = 160;

  const integrations = [
    ["/with/claude/", "Claude Code"],
    ["/with/codex/", "Codex"],
    ["/with/cursor/", "Cursor"],
    ["/with/openclaw/", "OpenClaw"],
    ["/with/replit/", "Replit"],
    ["/with/lovable/", "Lovable"],
    ["/with/vercel/", "Vercel"],
    ["/with/windsurf/", "Windsurf"],
    ["/with/hermes/", "Hermes"],
    ["/with/kilo/", "Kilo"],
    ["/with/aws/", "AWS"],
    ["/with/chatgpt/", "ChatGPT"],
    ["/with/api/", "API"],
  ];

  function normalizedPath() {
    const path = window.location.pathname.replace(/\/+$/, "");
    return path || "/";
  }

  function isCurrent(href, path) {
    const target = href.replace(/\/+$/, "") || "/";
    return target === path;
  }

  function currentAttribute(href, path) {
    return isCurrent(href, path) ? ' aria-current="page"' : "";
  }

  function homeAnchor(hash, path) {
    return path === "/" ? hash : `/${hash}`;
  }

  function integrationLinks(path) {
    return integrations
      .map(
        ([href, label]) =>
          `<a href="${href}"${currentAttribute(href, path)}>${label}</a>`,
      )
      .join("");
  }

  function primaryLinks(path) {
    const productHref = homeAnchor("#product", path);
    const compareHref = homeAnchor("#compare", path);
    const pricingHref = homeAnchor("#pricing", path);
    const deployHref = path === "/" ? "#hero-drop" : "/drop";
    const agentsCurrent =
      path === "/mcp" || path === "/plugins" || path.startsWith("/with/");

    return `
      <a href="${productHref}">Product</a>
      <div class="nav-mega" data-nav-mega>
        <button
          type="button"
          class="nav-mega-trigger"
          aria-expanded="false"
          aria-controls="nav-agents-panel"
          ${agentsCurrent ? 'aria-current="page"' : ""}
        >
          Agents
          <svg class="nav-mega-chevron" viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 4.5L6 8l3.5-3.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
        <div class="nav-mega-panel" id="nav-agents-panel" role="region" aria-label="Agents menu" hidden>
          <div class="nav-mega-col">
            <p class="nav-mega-label">Get started</p>
            <a href="/docs"${currentAttribute("/docs", path)}>
              <span class="nav-mega-title">Documentation</span>
              <span class="nav-mega-desc">What we support, deploy, secrets.</span>
            </a>
            <a href="/mcp"${currentAttribute("/mcp", path)}>
              <span class="nav-mega-title">MCP for agents</span>
              <span class="nav-mega-desc">Connect an agent and publish.</span>
            </a>
            <a href="/drop"${currentAttribute("/drop", path)}>
              <span class="nav-mega-title">Drop files</span>
              <span class="nav-mega-desc">Folder or zip → live URL.</span>
            </a>
            <a href="/plugins"${currentAttribute("/plugins", path)}>
              <span class="nav-mega-title">Agent plugin</span>
              <span class="nav-mega-desc">MCP, Skills, Plugins, Unix.</span>
            </a>
          </div>
          <div class="nav-mega-col nav-mega-list">
            <p class="nav-mega-label">Integrations</p>
            ${integrationLinks(path)}
          </div>
        </div>
      </div>
      <a href="/docs"${currentAttribute("/docs", path)}>Docs</a>
      <a href="${compareHref}">Compare</a>
      <a href="${pricingHref}">Pricing</a>
      <a href="/login" data-aft-auth="login">Log in</a>
      <a class="topnav-cta" href="${deployHref}"${currentAttribute("/drop", path)}>Deploy an app</a>
    `;
  }

  function renderDesktopNav(nav, path) {
    nav.className = "topnav topnav-rail";
    nav.innerHTML = `
      <div class="topnav-inner">
        <div class="topnav-brand-wrap">
          <a class="topnav-brand" href="/">aft<span>.</span>page</a>
          <span class="nav-beta">Beta</span>
        </div>
        <div class="topnav-links">
          ${primaryLinks(path)}
        </div>
        <button
          type="button"
          class="mobile-nav-toggle"
          aria-label="Open menu"
          aria-controls="mobile-nav-drawer"
          aria-expanded="false"
          data-mobile-nav-open
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M5 8h14M5 16h14" />
          </svg>
        </button>
      </div>
    `;
  }

  function renderMobileNav(nav, path) {
    document.querySelectorAll("[data-mobile-nav]").forEach((drawer) => drawer.remove());

    const productHref = homeAnchor("#product", path);
    const compareHref = homeAnchor("#compare", path);
    const pricingHref = homeAnchor("#pricing", path);
    const deployHref = path === "/" ? "#hero-drop" : "/drop";
    const agentsCurrent =
      path === "/mcp" || path === "/plugins" || path.startsWith("/with/");
    const drawer = document.createElement("div");

    drawer.className = "mobile-nav-drawer";
    drawer.id = "mobile-nav-drawer";
    drawer.dataset.mobileNav = "";
    drawer.setAttribute("role", "dialog");
    drawer.setAttribute("aria-modal", "true");
    drawer.setAttribute("aria-label", "Site menu");
    drawer.hidden = true;
    drawer.innerHTML = `
      <div class="mobile-nav-shell">
        <div class="mobile-nav-head">
          <div class="topnav-brand-wrap">
            <a class="topnav-brand" href="/">aft<span>.</span>page</a>
            <span class="nav-beta">Beta</span>
          </div>
          <button type="button" class="mobile-nav-close" aria-label="Close menu" data-mobile-nav-close>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </div>
        <nav class="mobile-nav-links" aria-label="Mobile primary">
          <a href="${productHref}">Product</a>
          <details class="mobile-nav-agents"${agentsCurrent ? " open" : ""}>
            <summary${agentsCurrent ? ' aria-current="page"' : ""}>
              Agents
              <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m3 6 5 5 5-5" /></svg>
            </summary>
            <div class="mobile-nav-agents-list">
              <a href="/mcp"${currentAttribute("/mcp", path)}>MCP</a>
              <a href="/plugins"${currentAttribute("/plugins", path)}>Plugin</a>
              ${integrationLinks(path)}
            </div>
          </details>
          <a href="/docs"${currentAttribute("/docs", path)}>Docs</a>
          <a href="${compareHref}">Compare</a>
          <a href="${pricingHref}">Pricing</a>
        </nav>
        <div class="mobile-nav-actions">
          <a href="/login" data-aft-auth="login">Log in</a>
          <a class="btn btn-primary" href="${deployHref}"${currentAttribute("/drop", path)}>Deploy an app</a>
        </div>
      </div>
    `;

    nav.insertAdjacentElement("afterend", drawer);
    return drawer;
  }

  function initMega(root) {
    const trigger = root.querySelector(".nav-mega-trigger");
    const panel = root.querySelector(".nav-mega-panel");
    if (!trigger || !panel) return;

    let openTimer = 0;
    let closeTimer = 0;
    let hoverMode = false;

    function setOpen(open) {
      root.classList.toggle("is-open", open);
      trigger.setAttribute("aria-expanded", open ? "true" : "false");
      if (open) panel.removeAttribute("hidden");
      else panel.setAttribute("hidden", "");
    }

    function openSoon() {
      window.clearTimeout(closeTimer);
      window.clearTimeout(openTimer);
      openTimer = window.setTimeout(() => setOpen(true), OPEN_DELAY);
    }

    function closeSoon() {
      window.clearTimeout(openTimer);
      window.clearTimeout(closeTimer);
      closeTimer = window.setTimeout(() => setOpen(false), CLOSE_DELAY);
    }

    function closeNow() {
      window.clearTimeout(openTimer);
      window.clearTimeout(closeTimer);
      setOpen(false);
    }

    trigger.addEventListener("click", (event) => {
      event.preventDefault();
      hoverMode = false;
      setOpen(trigger.getAttribute("aria-expanded") !== "true");
    });

    root.addEventListener("mouseenter", () => {
      if (window.matchMedia("(hover: hover) and (pointer: fine)").matches) {
        hoverMode = true;
        openSoon();
      }
    });
    root.addEventListener("mouseleave", () => {
      if (hoverMode) closeSoon();
    });
    root.addEventListener("focusout", (event) => {
      if (!root.contains(event.relatedTarget)) closeSoon();
    });

    trigger.addEventListener("keydown", (event) => {
      if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        setOpen(true);
        const first = panel.querySelector("a");
        if (first) first.focus();
      }
    });

    panel.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeNow();
        trigger.focus();
      }
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && root.classList.contains("is-open")) closeNow();
    });
    document.addEventListener("pointerdown", (event) => {
      if (!root.contains(event.target)) closeNow();
    });
  }

  function initMobile(drawer, openButton) {
    const closeButton = drawer.querySelector("[data-mobile-nav-close]");
    if (!openButton || !closeButton) return;

    let lastFocus = null;

    function focusableItems() {
      return [...drawer.querySelectorAll("a[href], button:not([disabled]), summary")].filter(
        (element) => element.getClientRects().length > 0,
      );
    }

    function open() {
      lastFocus = document.activeElement;
      drawer.hidden = false;
      document.body.classList.add("mobile-nav-open");
      openButton.setAttribute("aria-expanded", "true");
      closeButton.focus();
    }

    function close(options) {
      const restoreFocus = !options || options.restoreFocus !== false;
      drawer.hidden = true;
      document.body.classList.remove("mobile-nav-open");
      openButton.setAttribute("aria-expanded", "false");
      if (restoreFocus && lastFocus && typeof lastFocus.focus === "function") {
        lastFocus.focus();
      }
    }

    openButton.addEventListener("click", open);
    closeButton.addEventListener("click", () => close());
    drawer.addEventListener("click", (event) => {
      if (event.target.closest("a[href]")) close({ restoreFocus: false });
    });
    drawer.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
        return;
      }
      if (event.key !== "Tab") return;

      const items = focusableItems();
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    });

    const desktopQuery = window.matchMedia("(min-width: 761px)");
    const closeAtDesktop = (event) => {
      if (event.matches && !drawer.hidden) close({ restoreFocus: false });
    };
    if (desktopQuery.addEventListener) desktopQuery.addEventListener("change", closeAtDesktop);
    else desktopQuery.addListener(closeAtDesktop);
  }

  function boot() {
    const nav = document.querySelector(".topnav");
    if (!nav) return;

    const path = normalizedPath();
    renderDesktopNav(nav, path);
    const drawer = renderMobileNav(nav, path);
    const mega = nav.querySelector("[data-nav-mega]");
    if (mega) initMega(mega);
    initMobile(drawer, nav.querySelector("[data-mobile-nav-open]"));
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
