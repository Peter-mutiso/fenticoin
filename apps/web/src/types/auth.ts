/** Mirrors `PublicUser` from `apps/api/src/auth/auth.service.ts`. */
export interface PublicUser {
  id: string;
  email: string;
  status: string;
  kycStatus: string;
  emailVerifiedAt: string | null;
  phoneVerifiedAt: string | null;
  /** `'demo'` for a server-provisioned demo shadow account — see `AccountMenu`/`Header`'s Demo Mode indicator. */
  accountType: 'real' | 'demo';
  demoOfUserId: string | null;
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
