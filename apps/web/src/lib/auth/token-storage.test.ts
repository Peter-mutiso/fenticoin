import type { AuthResult } from '@/types/auth';
import { clearSession, getStoredAccessToken, restoreRealSession, stashRealSession, storeSession } from './token-storage';

function authResult(overrides: Partial<AuthResult['user']> = {}): AuthResult {
  return {
    accessToken: 'access-real',
    refreshToken: 'refresh-real',
    user: {
      id: 'user-1',
      email: 'trader@example.com',
      status: 'active',
      kycStatus: 'unverified',
      emailVerifiedAt: null,
      phoneVerifiedAt: null,
      accountType: 'real',
      demoOfUserId: null,
      ...overrides,
    },
  };
}

describe('token-storage: real/demo session transitions', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('stashes and restores the real session across an enter/exit Demo Mode cycle', () => {
    storeSession(authResult());
    stashRealSession();
    storeSession({ accessToken: 'access-demo', refreshToken: 'refresh-demo', user: { ...authResult().user, id: 'demo-1', accountType: 'demo', demoOfUserId: 'user-1' } });

    expect(getStoredAccessToken()).toBe('access-demo');

    const restored = restoreRealSession();
    expect(restored?.accessToken).toBe('access-real');
  });

  it('does not overwrite an existing stash if Enter Demo Mode is somehow triggered twice', () => {
    storeSession(authResult());
    stashRealSession();
    // Active session mutates (e.g. a token refresh) before a hypothetical second stash attempt.
    storeSession(authResult({ }));
    stashRealSession();

    const restored = restoreRealSession();
    expect(restored?.accessToken).toBe('access-real');
  });

  it('a full logout while inside Demo Mode clears the stashed real session too, so a later login is not shadowed by stale tokens', () => {
    storeSession(authResult());
    stashRealSession();
    storeSession({ accessToken: 'access-demo', refreshToken: 'refresh-demo', user: { ...authResult().user, id: 'demo-1', accountType: 'demo', demoOfUserId: 'user-1' } });

    // Logging out directly (not via "Exit Demo Mode") clears the active session.
    clearSession();

    // A brand-new real login follows.
    storeSession(authResult({ id: 'user-2' }));
    stashRealSession();
    storeSession({ accessToken: 'access-demo-2', refreshToken: 'refresh-demo-2', user: { ...authResult().user, id: 'demo-2', accountType: 'demo', demoOfUserId: 'user-2' } });

    const restored = restoreRealSession();
    // Must restore the session that was actually active before this second Demo Mode entry — not the first user's stale, already-cleared one.
    expect(restored?.user.id).toBe('user-2');
    expect(restored?.accessToken).toBe('access-real');
  });
});
