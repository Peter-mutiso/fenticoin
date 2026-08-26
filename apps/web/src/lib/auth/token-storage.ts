import type { AuthResult, PublicUser } from '@/types/auth';

/**
 * The one place session state touches `localStorage`. A JWT in
 * `localStorage` is readable by any script on the page (XSS risk) — the
 * backend currently only returns tokens in the response body, not as an
 * httpOnly cookie, so this is the available option for now. Flagged here
 * rather than hidden: moving to httpOnly cookies is a backend change
 * (`Set-Cookie` on login/refresh) that would let this whole module go away.
 */
const ACCESS_TOKEN_KEY = 'fenticoin.accessToken';
const REFRESH_TOKEN_KEY = 'fenticoin.refreshToken';
const USER_KEY = 'fenticoin.user';
/** Where the real-account session is stashed while Demo Mode is active — see `stashRealSession`/`restoreRealSession`. */
const REAL_SESSION_KEY = 'fenticoin.realSession';

function isBrowser(): boolean {
  return typeof window !== 'undefined';
}

export function getStoredAccessToken(): string | null {
  if (!isBrowser()) return null;
  return window.localStorage.getItem(ACCESS_TOKEN_KEY);
}

export function getStoredRefreshToken(): string | null {
  if (!isBrowser()) return null;
  return window.localStorage.getItem(REFRESH_TOKEN_KEY);
}

export function getStoredUser(): PublicUser | null {
  if (!isBrowser()) return null;
  const raw = window.localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PublicUser;
  } catch {
    return null;
  }
}

export function storeSession(result: AuthResult): void {
  if (!isBrowser()) return;
  window.localStorage.setItem(ACCESS_TOKEN_KEY, result.accessToken);
  window.localStorage.setItem(REFRESH_TOKEN_KEY, result.refreshToken);
  window.localStorage.setItem(USER_KEY, JSON.stringify(result.user));
}

/**
 * Clears the active session — and any stashed real session with it. A full
 * logout (including logging out directly from within Demo Mode via the
 * plain "Log out" button, rather than "Exit Demo Mode") must leave no
 * leftover state: without this, a stash left behind by that path would
 * silently survive to a *later*, unrelated login, and `stashRealSession`'s
 * "no-op if already stashed" guard would then skip stashing the new real
 * session — so a subsequent "Exit Demo Mode" would restore the wrong
 * (possibly stale/rotated) tokens instead of the session actually active.
 */
export function clearSession(): void {
  if (!isBrowser()) return;
  window.localStorage.removeItem(ACCESS_TOKEN_KEY);
  window.localStorage.removeItem(REFRESH_TOKEN_KEY);
  window.localStorage.removeItem(USER_KEY);
  window.localStorage.removeItem(REAL_SESSION_KEY);
}

/**
 * Copies the *currently active* session into a separate slot before it's
 * overwritten by a demo session, so "Exit Demo Mode" can restore it without
 * a network call. No-op if a real session is already stashed (entering
 * demo mode twice in a row must never overwrite the original with a demo
 * session by mistake).
 */
export function stashRealSession(): void {
  if (!isBrowser()) return;
  if (window.localStorage.getItem(REAL_SESSION_KEY)) return;

  const accessToken = getStoredAccessToken();
  const refreshToken = getStoredRefreshToken();
  const user = getStoredUser();
  if (!accessToken || !refreshToken || !user) return;

  window.localStorage.setItem(REAL_SESSION_KEY, JSON.stringify({ accessToken, refreshToken, user }));
}

export function restoreRealSession(): AuthResult | null {
  if (!isBrowser()) return null;
  const raw = window.localStorage.getItem(REAL_SESSION_KEY);
  if (!raw) return null;
  window.localStorage.removeItem(REAL_SESSION_KEY);
  try {
    return JSON.parse(raw) as AuthResult;
  } catch {
    return null;
  }
}
