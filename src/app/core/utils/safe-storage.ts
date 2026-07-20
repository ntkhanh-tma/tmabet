/**
 * Guarded wrappers around Web Storage.
 *
 * `localStorage`/`sessionStorage` access can throw — not just on writes when the
 * quota is exceeded (Safari Private Browsing, full storage), but even on *reads*
 * when the browser is set to block all site data / "Prevent Cross-Site Tracking".
 * A `typeof localStorage !== 'undefined'` check is not enough: the object exists
 * but touching it raises a `SecurityError`.
 *
 * These helpers never throw, so callers can treat storage as best-effort: a
 * blocked browser simply behaves as if nothing was stored, instead of crashing
 * the app or silently swallowing a click.
 */

function getStore(kind: 'local' | 'session'): Storage | null {
  try {
    const store = kind === 'local' ? window.localStorage : window.sessionStorage;
    // Touching a property is what actually triggers the SecurityError.
    void store.length;
    return store;
  } catch {
    return null;
  }
}

export function safeGetItem(key: string, kind: 'local' | 'session' = 'local'): string | null {
  const store = getStore(kind);
  if (!store) return null;
  try {
    return store.getItem(key);
  } catch {
    return null;
  }
}

/** Returns true when the value was persisted, false when storage was unavailable. */
export function safeSetItem(key: string, value: string, kind: 'local' | 'session' = 'local'): boolean {
  const store = getStore(kind);
  if (!store) return false;
  try {
    store.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

export function safeRemoveItem(key: string, kind: 'local' | 'session' = 'local'): void {
  const store = getStore(kind);
  if (!store) return;
  try {
    store.removeItem(key);
  } catch {
    // ignore — nothing we can do
  }
}
