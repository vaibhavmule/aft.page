/**
 * Shared /v1/me — one in-flight fetch + sessionStorage for optimistic UI.
 * Exposes window.aftAuth: { getMe, peekMe, clearMe }.
 */
(function (global) {
  const API = "https://api.aft.page";
  const CACHE_KEY = "aft.me";
  const CACHE_TTL_MS = 5 * 60 * 1000;
  const LOCAL_USER = { id: "local", email: "dev@localhost" };

  /** @type {Promise<{ id: string, email: string } | null> | null} */
  let inflight = null;

  function isLocalDev() {
    try {
      const h = global.location.hostname;
      return h === "localhost" || h === "127.0.0.1";
    } catch {
      return false;
    }
  }

  function readCache() {
    try {
      const raw = sessionStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return null;
      if (!parsed.user?.email || typeof parsed.at !== "number") return null;
      return parsed;
    } catch {
      return null;
    }
  }

  function writeCache(user) {
    try {
      if (!user) {
        sessionStorage.removeItem(CACHE_KEY);
        return;
      }
      sessionStorage.setItem(
        CACHE_KEY,
        JSON.stringify({ user, at: Date.now() }),
      );
    } catch {
      /* quota */
    }
  }

  function isFresh(entry) {
    return Boolean(entry && Date.now() - entry.at < CACHE_TTL_MS);
  }

  function emit(user) {
    try {
      global.dispatchEvent(
        new CustomEvent("aft:auth", { detail: { user } }),
      );
    } catch {
      /* ignore */
    }
  }

  function fetchMe() {
    if (isLocalDev()) return Promise.resolve(LOCAL_USER);
    if (inflight) return inflight;
    inflight = (async () => {
      try {
        const res = await fetch(`${API}/v1/me`, { credentials: "include" });
        if (!res.ok) {
          writeCache(null);
          emit(null);
          return null;
        }
        const user = await res.json();
        if (!user?.email) {
          writeCache(null);
          emit(null);
          return null;
        }
        writeCache(user);
        emit(user);
        return user;
      } catch {
        const cached = readCache();
        return cached?.user ?? null;
      } finally {
        inflight = null;
      }
    })();
    return inflight;
  }

  /**
   * @param {{ force?: boolean }} [opts]
   * @returns {Promise<{ id: string, email: string } | null>}
   */
  function getMe(opts) {
    if (isLocalDev()) return Promise.resolve(LOCAL_USER);
    const force = Boolean(opts && opts.force);
    if (!force) {
      const cached = readCache();
      if (isFresh(cached)) {
        fetchMe();
        return Promise.resolve(cached.user);
      }
    }
    return fetchMe();
  }

  function peekMe() {
    if (isLocalDev()) return LOCAL_USER;
    return readCache()?.user ?? null;
  }

  function clearMe() {
    writeCache(null);
    emit(null);
  }

  function loginNext() {
    return `${global.location.pathname}${global.location.search}`;
  }

  /** Redirect to login. Optional `next` path (defaults to current URL). */
  function goLogin(next) {
    if (isLocalDev()) return;
    const dest = typeof next === "string" && next ? next : loginNext();
    global.location.replace(`/login?next=${encodeURIComponent(dest)}`);
  }

  /**
   * Gate authenticated pages: peek cache → fetch /v1/me → redirect if missing.
   * @param {{ next?: string, timeoutMs?: number }} [opts]
   */
  async function requireLogin(opts = {}) {
    if (isLocalDev()) return LOCAL_USER;
    const next = opts.next;
    const timeoutMs = opts.timeoutMs ?? 8000;
    const cached = peekMe();
    if (cached) return cached;
    try {
      const user = await Promise.race([
        fetchMe(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("me-timeout")), timeoutMs),
        ),
      ]);
      if (!user) {
        goLogin(next);
        return null;
      }
      return user;
    } catch {
      if (cached) return cached;
      goLogin(next);
      return null;
    }
  }

  global.aftAuth = {
    getMe,
    peekMe,
    clearMe,
    fetchMe,
    goLogin,
    requireLogin,
    isLocalDev,
  };
})(typeof window !== "undefined" ? window : globalThis);
