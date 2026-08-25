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

export function clearSession(): void {
  if (!isBrowser()) return;
  window.localStorage.removeItem(ACCESS_TOKEN_KEY);
  window.localStorage.removeItem(REFRESH_TOKEN_KEY);
  window.localStorage.removeItem(USER_KEY);
}
