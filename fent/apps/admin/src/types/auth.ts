/** Mirrors `PublicUser` from `apps/api/src/auth/auth.service.ts` — returned by login/register. */
export interface PublicUser {
  id: string;
  email: string;
  status: string;
  kycStatus: string;
  emailVerifiedAt: string | null;
  phoneVerifiedAt: string | null;
}

/** Mirrors `AuthResult` — a successful login/register/refresh response. */
export interface AuthResult {
  accessToken: string;
  refreshToken: string;
  user: PublicUser;
}

/** Mirrors `TwoFactorChallenge` — returned instead of `AuthResult` when the account has 2FA enabled. */
export interface TwoFactorChallenge {
  twoFactorRequired: true;
  challengeToken: string;
}

export function isTwoFactorChallenge(result: AuthResult | TwoFactorChallenge): result is TwoFactorChallenge {
  return 'twoFactorRequired' in result;
}

/**
 * Mirrors `RequestUser` in `apps/api/src/authorization/types/request-user.ts`
 * exactly — this is what `GET /auth/me` actually returns. `permissions` and
 * `roles` here are load-bearing for the admin app (unlike the user-facing
 * app, which only uses `getMe()` as a session-liveness check): every
 * UI-level show/hide decision in this app reads from this shape. The real
 * enforcement is always server-side (`PermissionsGuard`), never this.
 */
export interface RequestUser {
  id: string;
  email: string;
  status: string;
  sessionId: string;
  roles: string[];
  permissions: string[];
}
