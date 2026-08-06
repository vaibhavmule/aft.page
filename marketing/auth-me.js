/**
 * Shared /v1/me — one in-flight fetch + sessionStorage for optimistic UI.
 * Exposes window.aftAuth: { getMe, peekMe, clearMe }.
 */
(function (global) {
  const API = "https://api.aft.page";
  const CACHE_KEY = "aft.me";
  const CACHE_TTL_MS = 5 * 60 * 1000;

  /** @type {Promise<{ id: string, email: string } | null> | null} */
  let inflight = null;

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
    return readCache()?.user ?? null;
  }

  function clearMe() {
    writeCache(null);
    emit(null);
  }

  global.aftAuth = { getMe, peekMe, clearMe, fetchMe };
})(typeof window !== "undefined" ? window : globalThis);
