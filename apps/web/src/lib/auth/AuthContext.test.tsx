import { act, renderHook, waitFor } from '@testing-library/react';

import { getStoredAccessToken, getStoredUser, storeSession } from './token-storage';
import { AuthProvider, useAuth } from './AuthContext';

const mockGetMe = jest.fn();
const mockEnterDemo = jest.fn();
const mockLogout = jest.fn();

jest.mock('@/lib/api-client', () => {
  const actual = jest.requireActual('@/lib/api-client');
  return {
    ...actual,
    getMe: (...args: unknown[]) => mockGetMe(...args),
    enterDemo: (...args: unknown[]) => mockEnterDemo(...args),
    logout: (...args: unknown[]) => mockLogout(...args),
  };
});

function realUser(id = 'user-1') {
  return { id, email: 'trader@example.com', status: 'active', kycStatus: 'unverified', emailVerifiedAt: null, phoneVerifiedAt: null, accountType: 'real' as const, demoOfUserId: null };
}

function demoUser(id = 'demo-1', realId = 'user-1') {
  return { id, email: `demo+${realId}@fenticoin.demo.internal`, status: 'active', kycStatus: 'unverified', emailVerifiedAt: null, phoneVerifiedAt: null, accountType: 'demo' as const, demoOfUserId: realId };
}

describe('AuthContext: exitDemoMode', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    window.localStorage.clear();
    mockGetMe.mockResolvedValue({ id: 'user-1', email: 'trader@example.com', status: 'active', sessionId: 's1', roles: [], permissions: [], accountType: 'real', demoOfUserId: null });
  });

  it('restores the real session even though the API client\'s own `logout()` clears all session storage (including the stash) as part of its normal cleanup', async () => {
    // `api-client.ts`'s real `logout()` always runs `finally { clearSession(); }`
    // once its request settles — and `clearSession()` also wipes the demo-mode
    // stash (so a *direct* logout from within Demo Mode doesn't leave a stale
    // stash behind for a later login). `exitDemoMode` must still end up back on
    // the real session despite that shared side effect. Mocking `logout` to
    // reproduce exactly that real side effect (not just resolving quietly) is
    // what would have caught the ordering bug: reading the stash before
    // popping it, versus after, only differs once something else touches
    // storage in between — a plain `jest.fn().mockResolvedValue(undefined)`
    // would pass either way, revealing nothing.
    mockLogout.mockImplementation(async () => {
      window.localStorage.removeItem('fenticoin.accessToken');
      window.localStorage.removeItem('fenticoin.refreshToken');
      window.localStorage.removeItem('fenticoin.user');
      window.localStorage.removeItem('fenticoin.realSession');
    });

    storeSession({ accessToken: 'access-real', refreshToken: 'refresh-real', user: realUser() });
    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });
    await waitFor(() => expect(result.current.status).toBe('authenticated'));

    mockEnterDemo.mockResolvedValue({ accessToken: 'access-demo', refreshToken: 'refresh-demo', user: demoUser() });
    await act(async () => {
      await result.current.enterDemoMode();
    });
    expect(result.current.isDemo).toBe(true);
    expect(getStoredAccessToken()).toBe('access-demo');

    await act(async () => {
      await result.current.exitDemoMode();
    });

    expect(mockLogout).toHaveBeenCalled();
    expect(result.current.status).toBe('authenticated');
    expect(result.current.isDemo).toBe(false);
    expect(getStoredUser()?.id).toBe('user-1');
    expect(getStoredAccessToken()).toBe('access-real');
  });

  it('falls back to a full sign-out if there is no stashed real session to restore', async () => {
    mockLogout.mockResolvedValue(undefined);
    // A demo session active with no stash at all (e.g. storage was cleared mid-session).
    storeSession({ accessToken: 'access-demo', refreshToken: 'refresh-demo', user: demoUser() });
    mockGetMe.mockResolvedValue({ id: 'demo-1', email: 'demo@fenticoin.demo.internal', status: 'active', sessionId: 's1', roles: [], permissions: [], accountType: 'demo', demoOfUserId: 'user-1' });
    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });
    await waitFor(() => expect(result.current.status).toBe('authenticated'));

    await act(async () => {
      await result.current.exitDemoMode();
    });

    expect(result.current.status).toBe('unauthenticated');
    expect(result.current.user).toBeNull();
    expect(getStoredAccessToken()).toBeNull();
  });
});
