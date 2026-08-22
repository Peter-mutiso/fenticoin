import type { AuthResult, PublicUser } from '@/types/auth';

/**
 * The one place session state touches `localStorage`. Namespaced under
 * `fenticoin.admin.*` (distinct from the user-facing app's `fenticoin.*`
 * keys) — dev already isolates the two apps by port, but this is cheap
 * insurance against a future same-origin deployment (e.g. both apps behind
 * one reverse-proxy origin) ever mixing up an admin's session with a
 * regular user session in the same browser.
 */
const ACCESS_TOKEN_KEY = 'fenticoin.admin.accessToken';
const REFRESH_TOKEN_KEY = 'fenticoin.admin.refreshToken';
const USER_KEY = 'fenticoin.admin.user';

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
