import { createHash, randomBytes } from 'node:crypto';

import { Injectable, UnauthorizedException } from '@nestjs/common';
// Value imports (JwtService, AppConfigService): constructor-injected
// without an explicit `@Inject()` token — see eslint.config.js.
import { JwtService } from '@nestjs/jwt';

import { AppConfigService } from '../../config/app-config.service';

export interface AccessTokenPayload {
  sub: string; // user id
  sid: string; // session id
  typ: 'access';
}

export interface ChallengeTokenPayload {
  sub: string; // user id
  typ: 'two_factor_challenge';
}

export interface OAuthStatePayload {
  nonce: string;
  typ: 'oauth_state';
}

/**
 * Access tokens intentionally carry *no* roles/permissions — those are
 * resolved fresh from the database on every request (see
 * `authorization/authorization.service.ts`) so a role/permission change or
 * account suspension takes effect immediately instead of waiting for a
 * token to expire.
 */
@Injectable()
export class TokenService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly config: AppConfigService,
  ) {}

  signAccessToken(userId: string, sessionId: string): string {
    const payload: AccessTokenPayload = { sub: userId, sid: sessionId, typ: 'access' };
    return this.jwtService.sign(payload, {
      secret: this.config.jwtSecret,
      expiresIn: this.config.accessTokenTtlSeconds,
    });
  }

  verifyAccessToken(token: string): AccessTokenPayload {
    const payload = this.verify<AccessTokenPayload>(token);
    if (payload.typ !== 'access') {
      throw new UnauthorizedException('Invalid token type');
    }
    return payload;
  }

  /** Short-lived token proving "password already verified, awaiting 2FA code". */
  signTwoFactorChallengeToken(userId: string): string {
    const payload: ChallengeTokenPayload = { sub: userId, typ: 'two_factor_challenge' };
    return this.jwtService.sign(payload, { secret: this.config.jwtSecret, expiresIn: '5m' });
  }

  verifyTwoFactorChallengeToken(token: string): ChallengeTokenPayload {
    const payload = this.verify<ChallengeTokenPayload>(token);
    if (payload.typ !== 'two_factor_challenge') {
      throw new UnauthorizedException('Invalid token type');
    }
    return payload;
  }

  /**
   * Self-contained CSRF state for the OAuth redirect round-trip — signed
   * and short-lived, so it can't be forged or replayed after 10 minutes,
   * without needing a server-side store or a cookie for this early phase.
   */
  signOAuthState(): string {
    const payload: OAuthStatePayload = { nonce: randomBytes(16).toString('hex'), typ: 'oauth_state' };
    return this.jwtService.sign(payload, { secret: this.config.jwtSecret, expiresIn: '10m' });
  }

  verifyOAuthState(state: string): void {
    const payload = this.verify<OAuthStatePayload>(state);
    if (payload.typ !== 'oauth_state') {
      throw new UnauthorizedException('Invalid OAuth state');
    }
  }

  private verify<T extends object>(token: string): T {
    try {
      return this.jwtService.verify<T>(token, { secret: this.config.jwtSecret });
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }
  }

  /** Opaque refresh token: random bytes sent to the client, only the hash stored server-side. */
  generateOpaqueToken(): { raw: string; hash: string } {
    const raw = randomBytes(32).toString('hex');
    return { raw, hash: this.hashOpaqueToken(raw) };
  }

  hashOpaqueToken(raw: string): string {
    return createHash('sha256').update(raw).digest('hex');
  }

  /** Numeric OTP (phone/email), e.g. "482913". Not cryptographically reversible once hashed. */
  generateNumericOtp(digits = 6): string {
    const max = 10 ** digits;
    const value = randomBytes(4).readUInt32BE(0) % max;
    return value.toString().padStart(digits, '0');
  }
}
