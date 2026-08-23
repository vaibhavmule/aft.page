/** Shared Projects hub UI — cards, thumbs, share modal. */
(function (global) {
  const API = "https://api.aft.page";

  function formatRelativeTime(iso) {
    if (!iso) return "—";
    const t = new Date(iso).getTime();
    if (!Number.isFinite(t)) return "—";
    const sec = Math.max(0, Math.floor((Date.now() - t) / 1000));
    if (sec < 60) return "just now";
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min}m`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr}h`;
    const day = Math.floor(hr / 24);
    if (day < 7) return `${day}d`;
    const wk = Math.floor(day / 7);
    if (wk < 5) return `${wk}w`;
    const mo = Math.floor(day / 30);
    if (mo < 12) return `${mo}mo`;
    return `${Math.floor(day / 365)}y`;
  }

  function visibilityMeta(site) {
    const vis = site.visibility === "private" ? "private" : "public";
    if (site.role && site.role !== "owner") {
      return { label: "Shared with you", icon: "users", private: true };
    }
    if (vis === "private") {
      return { label: "Only you", icon: "lock", private: true };
    }
    return { label: "Everyone", icon: "globe", private: false };
  }

  function iconSvg(name) {
    if (name === "lock") {
      return '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>';
    }
    if (name === "globe") {
      return '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18"/></svg>';
    }
    return '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>';
  }

  let thumbObserver = null;

  function observeLazyImg(img, url) {
    if (!("IntersectionObserver" in window)) {
      img.src = url;
      return;
    }
    if (!thumbObserver) {
      thumbObserver = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (!entry.isIntersecting) continue;
            const node = entry.target;
            const src = node.getAttribute("data-src");
            if (src) {
              node.src = src;
              node.removeAttribute("data-src");
            }
            thumbObserver.unobserve(node);
          }
        },
        { rootMargin: "160px 0px", threshold: 0.01 },
      );
    }
    img.setAttribute("data-src", url);
    thumbObserver.observe(img);
  }

  /**
   * Card thumb: R2 screenshot (`thumbUrl`) as lazy &lt;img&gt;, letter fallback.
   * No iframes — see docs/PROJECTS-UI.md appendix.
   * @param {{ slug: string, thumbUrl?: string|null, url?: string }} opts
   */
  function renderThumb(opts) {
    const slug = typeof opts === "string" ? arguments[1] : opts?.slug;
    // Back-compat: renderThumb(liveUrl, slug) → letter only (ignore live url)
    const thumbUrl =
      typeof opts === "string" ? null : opts?.thumbUrl || null;
    const wrap = document.createElement("div");
    wrap.className = "project-card-thumb";
    const letter = (slug || "?").charAt(0).toUpperCase();
    const fallback = document.createElement("div");
    fallback.className = "project-card-thumb-fallback";
    fallback.textContent = letter;
    fallback.setAttribute("aria-hidden", "true");
    wrap.appendChild(fallback);
    if (thumbUrl) {
      const img = document.createElement("img");
      img.className = "project-card-thumb-img";
      img.alt = "";
      img.decoding = "async";
      img.loading = "lazy";
      img.addEventListener("load", () => {
        fallback.hidden = true;
      });
      img.addEventListener("error", () => {
        img.remove();
      });
      wrap.appendChild(img);
      observeLazyImg(img, thumbUrl);
    }
    return wrap;
  }

  let shareModalEl = null;
  let shareFocusReturn = null;

  function closeShareModal() {
    if (!shareModalEl) return;
    shareModalEl.remove();
    shareModalEl = null;
    document.body.classList.remove("projects-modal-open");
    if (shareFocusReturn) {
      shareFocusReturn.focus();
      shareFocusReturn = null;
    }
  }

  async function copyText(text, btn) {
    try {
      await navigator.clipboard.writeText(text);
      const prev = btn.textContent;
      btn.textContent = "Copied";
      setTimeout(() => {
        btn.textContent = prev;
      }, 1400);
    } catch (_) {
      window.prompt("Copy link:", text);
    }
  }

  /**
   * @param {{ slug: string, url?: string, visibility?: string, role?: string, ownerEmail?: string, onChange?: () => void }} opts
   */
  async function openShareModal(opts) {
    closeShareModal();
    const slug = opts.slug;
    const live = opts.url || `https://${slug}.aft.page`;
    const isOwner = !opts.role || opts.role === "owner";
    shareFocusReturn = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    let info = { ...opts, email: opts.ownerEmail };
    try {
      const res = await fetch(`${API}/v1/sites/${encodeURIComponent(slug)}`, {
        credentials: "include",
      });
      if (res.ok) info = { ...info, ...(await res.json()) };
    } catch (_) {
      /* use passed opts */
    }

    const vis = info.visibility === "private" ? "private" : "public";
    const backdrop = document.createElement("div");
    backdrop.className = "share-modal-backdrop";
    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop) closeShareModal();
    });

    const panel = document.createElement("div");
    panel.className = "share-modal";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-modal", "true");
    panel.setAttribute("aria-labelledby", "share-modal-title");

    const title = document.createElement("h2");
    title.id = "share-modal-title";
    title.textContent = `Share ${slug}`;

    const accessRow = document.createElement("div");
    accessRow.className = "share-modal-access";
    const accessLabel = document.createElement("span");
    accessLabel.className = "share-modal-label";
    accessLabel.textContent = "Who can view";
    const accessVal = document.createElement("div");
    accessVal.className = "share-modal-access-val";

    if (isOwner) {
      const sel = document.createElement("select");
      sel.className = "share-modal-select";
      sel.innerHTML =
        '<option value="private">Just me</option><option value="public">Everyone</option>';
      sel.value = vis;
      sel.addEventListener("change", async () => {
        const next = sel.value === "public" ? "public" : "private";
        sel.disabled = true;
        try {
          const res = await fetch(`${API}/v1/sites/${encodeURIComponent(slug)}`, {
            method: "PATCH",
            credentials: "include",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ visibility: next }),
          });
          if (!res.ok) {
            sel.value = vis;
            return;
          }
          if (opts.onChange) opts.onChange();
        } catch (_) {
          sel.value = vis;
        } finally {
          sel.disabled = false;
        }
      });
      accessVal.appendChild(sel);
    } else {
      const meta = visibilityMeta({ visibility: vis, role: opts.role });
      accessVal.innerHTML = `${iconSvg(meta.icon)} <span>${meta.label}</span>`;
    }
    accessRow.append(accessLabel, accessVal);

    const ownerRow = document.createElement("div");
    ownerRow.className = "share-modal-owner";
    ownerRow.innerHTML = `<span class="share-modal-label">Owner</span><span>${info.email || opts.ownerEmail || "—"}</span>`;

    const actions = document.createElement("div");
    actions.className = "share-modal-actions";
    const visit = document.createElement("a");
    visit.className = "btn";
    visit.href = live;
    visit.target = "_blank";
    visit.rel = "noopener";
    visit.textContent = "Visit";
    const copy = document.createElement("button");
    copy.type = "button";
    copy.className = "btn ghost";
    copy.textContent = "Copy link";
    copy.addEventListener("click", () => copyText(live, copy));
    actions.append(visit, copy);

    const manage =
      isOwner
        ? (() => {
            const a = document.createElement("a");
            a.className = "share-modal-manage";
            a.href = `/project/?slug=${encodeURIComponent(slug)}&tab=access`;
            a.textContent = "Manage invites";
            return a;
          })()
        : null;

    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "share-modal-close";
    closeBtn.setAttribute("aria-label", "Close");
    closeBtn.textContent = "×";
    closeBtn.addEventListener("click", closeShareModal);

    panel.append(closeBtn, title, accessRow, ownerRow, actions);
    if (manage) panel.appendChild(manage);
    backdrop.appendChild(panel);
    document.body.appendChild(backdrop);
    document.body.classList.add("projects-modal-open");
    shareModalEl = backdrop;

    const onKey = (e) => {
      if (e.key === "Escape") {
        closeShareModal();
        document.removeEventListener("keydown", onKey);
      }
    };
    document.addEventListener("keydown", onKey);
    visit.focus();
  }

  global.AftProjectsUI = {
    API,
    formatRelativeTime,
    visibilityMeta,
    iconSvg,
    renderThumb,
    openShareModal,
    closeShareModal,
  };
})(window);
