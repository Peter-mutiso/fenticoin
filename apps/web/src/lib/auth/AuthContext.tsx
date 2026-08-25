'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import {
  getMe,
  register as apiRegister,
  login as apiLogin,
  loginWithTwoFactor as apiLoginWithTwoFactor,
  logout as apiLogout,
  logoutAll as apiLogoutAll,
  NetworkError,
} from '@/lib/api-client';
import type { PublicUser } from '@/types/auth';
import { isTwoFactorChallenge } from '@/types/auth';
import { clearSession, getStoredUser, storeSession } from './token-storage';

type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

export type LoginOutcome = { twoFactorRequired: true; challengeToken: string } | { twoFactorRequired: false };

interface AuthContextValue {
  status: AuthStatus;
  user: PublicUser | null;
  /**
   * Set only when hydration's `getMe()` call failed because the API
   * couldn't be reached at all (timeout/offline/DNS/CORS) — as opposed to
   * a clean 401 meaning "no valid session." Lets a protected route show
   * "can't reach the server, retry" instead of a misleading "please log
   * in" when the real problem is connectivity, not authentication.
   */
  hydrationError: 'network' | null;
  login: (email: string, password: string) => Promise<LoginOutcome>;
  register: (email: string, password: string, dateOfBirth?: string) => Promise<void>;
  loginWithTwoFactor: (challengeToken: string, code: string) => Promise<void>;
  logout: () => Promise<void>;
  logoutAll: () => Promise<void>;
  /** Re-runs hydration — used by the "can't reach the server, retry" recovery action. */
  retry: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

/**
 * Hydrates session state from `localStorage` on mount and validates it
 * against `/auth/me` — a token that looks present but is actually expired
 * or revoked resolves to `unauthenticated` here rather than letting the
 * rest of the app discover that piecemeal on its first authenticated
 * request. Nothing about *authorization* is ever decided client-side: this
 * only tracks "do we currently believe we have a valid session," which the
 * server re-verifies on every request regardless.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [user, setUser] = useState<PublicUser | null>(null);
  const [hydrationError, setHydrationError] = useState<'network' | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function hydrate() {
      setHydrationError(null);
      const cachedUser = getStoredUser();
      if (cachedUser && !cancelled) setUser(cachedUser);

      try {
        // `getMe()` returns `RequestUser` (id/email/status/sessionId/roles/permissions),
        // not `PublicUser` — it has no kycStatus/emailVerifiedAt/phoneVerifiedAt. It is
        // used here purely as a liveness check for the stored session; the richer
        // `cachedUser` set above (captured at login/register time, the only place those
        // fields are ever returned) stays as the source of truth for `user`.
        await getMe();
        if (!cancelled) {
          setStatus('authenticated');
        }
      } catch (err) {
        if (!cancelled) {
          // A network failure (timeout/offline/CORS) doesn't mean the
          // session is invalid — don't discard it, so a retry (or the
          // next authenticated request) can succeed once the API is
          // reachable again. Only a real 401/403 from the server means
          // "log in again."
          if (err instanceof NetworkError) {
            setHydrationError('network');
            setStatus('unauthenticated');
          } else {
            clearSession();
            setUser(null);
            setStatus('unauthenticated');
          }
        }
      }
    }

    void hydrate();
    return () => {
      cancelled = true;
    };
  }, [retryCount]);

  const retry = useCallback(() => {
    setStatus('loading');
    setRetryCount((n) => n + 1);
  }, []);

  const register = useCallback(async (email: string, password: string, dateOfBirth?: string): Promise<void> => {
    const result = await apiRegister({ email, password, ...(dateOfBirth ? { dateOfBirth } : {}) });
    storeSession(result);
    setUser(result.user);
    setStatus('authenticated');
  }, []);

  const login = useCallback(async (email: string, password: string): Promise<LoginOutcome> => {
    const result = await apiLogin({ email, password });
    if (isTwoFactorChallenge(result)) {
      return { twoFactorRequired: true, challengeToken: result.challengeToken };
    }
    storeSession(result);
    setUser(result.user);
    setStatus('authenticated');
    return { twoFactorRequired: false };
  }, []);

  const loginWithTwoFactor = useCallback(async (challengeToken: string, code: string): Promise<void> => {
    const result = await apiLoginWithTwoFactor(challengeToken, code);
    storeSession(result);
    setUser(result.user);
    setStatus('authenticated');
  }, []);

  const logout = useCallback(async (): Promise<void> => {
    try {
      await apiLogout();
    } catch {
      // Best-effort — the local session is cleared either way.
    }
    setUser(null);
    setStatus('unauthenticated');
  }, []);

  const logoutAll = useCallback(async (): Promise<void> => {
    try {
      await apiLogoutAll();
    } catch {
      // Best-effort — the local session is cleared either way.
    }
    setUser(null);
    setStatus('unauthenticated');
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ status, user, hydrationError, login, register, loginWithTwoFactor, logout, logoutAll, retry }),
    [status, user, hydrationError, login, register, loginWithTwoFactor, logout, logoutAll, retry],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
