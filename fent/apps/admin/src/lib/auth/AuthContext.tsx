'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { getMe, login as apiLogin, loginWithTwoFactor as apiLoginWithTwoFactor, logout as apiLogout, NetworkError } from '@/lib/api-client';
import type { PublicUser } from '@/types/auth';
import { isTwoFactorChallenge } from '@/types/auth';
import { clearSession, getStoredAccessToken, getStoredUser, storeSession } from './token-storage';

type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

export type LoginOutcome =
  | { twoFactorRequired: true; challengeToken: string }
  | { twoFactorRequired: false; permissions: string[] };

interface AuthContextValue {
  status: AuthStatus;
  user: PublicUser | null;
  /**
   * Load-bearing for this app (unlike the user-facing app, which only
   * treats `getMe()` as a session-liveness check): every UI-level
   * show/hide decision here reads `permissions`. The real gate is always
   * server-side `PermissionsGuard` — this only controls what's rendered.
   */
  permissions: string[];
  roles: string[];
  /** Set only when hydration's `getMe()` call failed because the API couldn't be reached at all — see apps/web's identical field for the full rationale. */
  hydrationError: 'network' | null;
  login: (email: string, password: string) => Promise<LoginOutcome>;
  loginWithTwoFactor: (challengeToken: string, code: string) => Promise<string[]>;
  logout: () => Promise<void>;
  hasPermission: (permission: string) => boolean;
  /** Re-runs hydration — used by the "can't reach the server, retry" recovery action. */
  retry: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [user, setUser] = useState<PublicUser | null>(null);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [roles, setRoles] = useState<string[]>([]);
  const [hydrationError, setHydrationError] = useState<'network' | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function hydrate() {
      setHydrationError(null);
      const token = getStoredAccessToken();
      if (!token) {
        if (!cancelled) setStatus('unauthenticated');
        return;
      }

      const cachedUser = getStoredUser();
      if (cachedUser && !cancelled) setUser(cachedUser);

      try {
        const me = await getMe();
        if (!cancelled) {
          setPermissions(me.permissions);
          setRoles(me.roles);
          setStatus('authenticated');
        }
      } catch (err) {
        if (!cancelled) {
          // A network failure doesn't invalidate the stored session — see
          // apps/web's identical branch for the full rationale.
          if (err instanceof NetworkError) {
            setHydrationError('network');
            setStatus('unauthenticated');
          } else {
            clearSession();
            setUser(null);
            setPermissions([]);
            setRoles([]);
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

  const login = useCallback(async (email: string, password: string): Promise<LoginOutcome> => {
    const result = await apiLogin({ email, password });
    if (isTwoFactorChallenge(result)) {
      return { twoFactorRequired: true, challengeToken: result.challengeToken };
    }
    storeSession(result);
    setUser(result.user);
    const me = await getMe();
    setPermissions(me.permissions);
    setRoles(me.roles);
    setStatus('authenticated');
    return { twoFactorRequired: false, permissions: me.permissions };
  }, []);

  const loginWithTwoFactor = useCallback(async (challengeToken: string, code: string): Promise<string[]> => {
    const result = await apiLoginWithTwoFactor(challengeToken, code);
    storeSession(result);
    setUser(result.user);
    const me = await getMe();
    setPermissions(me.permissions);
    setRoles(me.roles);
    setStatus('authenticated');
    return me.permissions;
  }, []);

  const logout = useCallback(async (): Promise<void> => {
    try {
      await apiLogout();
    } catch {
      // Best-effort — the local session is cleared either way.
    }
    setUser(null);
    setPermissions([]);
    setRoles([]);
    setStatus('unauthenticated');
  }, []);

  const hasPermission = useCallback((permission: string) => permissions.includes(permission), [permissions]);

  const value = useMemo<AuthContextValue>(
    () => ({ status, user, permissions, roles, hydrationError, login, loginWithTwoFactor, logout, hasPermission, retry }),
    [status, user, permissions, roles, hydrationError, login, loginWithTwoFactor, logout, hasPermission, retry],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
