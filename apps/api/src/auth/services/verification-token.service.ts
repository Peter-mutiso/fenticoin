import { Inject, Injectable } from '@nestjs/common';
import { and, eq, isNull } from 'drizzle-orm';

import { DRIZZLE_CLIENT } from '../../database/database.constants';
import type { DrizzleDb } from '../../database/database.types';
import { verificationTokens } from '../../database/schema';
// Value import: constructor-injected without an explicit `@Inject()` token.
import { TokenService } from './token.service';

export type VerificationTokenType = 'email_verification' | 'phone_otp' | 'password_reset';

const MAX_VERIFY_ATTEMPTS = 5;

/**
 * Backs email verification, phone OTP, and password reset with one shared
 * implementation: generate a value, store only its hash, expire it, allow
 * a bounded number of wrong guesses before it's dead. Issuing a new token
 * of the same type for the same user invalidates any previous one, so
 * there is never more than one live token per (user, type).
 */
@Injectable()
export class VerificationTokenService {
  constructor(
    @Inject(DRIZZLE_CLIENT) private readonly db: DrizzleDb,
    private readonly tokenService: TokenService,
  ) {}

  async issueOtp(
    userId: string,
    type: VerificationTokenType,
    identifier: string,
    ttlMinutes: number,
  ): Promise<string> {
    const code = this.tokenService.generateNumericOtp(6);
    await this.issue(userId, type, identifier, code, ttlMinutes);
    return code;
  }

  async issueOpaqueToken(
    userId: string,
    type: VerificationTokenType,
    identifier: string,
    ttlMinutes: number,
  ): Promise<string> {
    const { raw } = this.tokenService.generateOpaqueToken();
    await this.issue(userId, type, identifier, raw, ttlMinutes);
    return raw;
  }

  private async issue(
    userId: string,
    type: VerificationTokenType,
    identifier: string,
    raw: string,
    ttlMinutes: number,
  ): Promise<void> {
    await this.invalidateActive(userId, type);
    await this.db.insert(verificationTokens).values({
      userId,
      type,
      identifier,
      tokenHash: this.tokenService.hashOpaqueToken(raw),
      expiresAt: new Date(Date.now() + ttlMinutes * 60 * 1000),
    });
  }

  /** Consumes a token/OTP if it's valid. Returns the userId it belonged to, or `undefined`. */
  async verify(type: VerificationTokenType, identifier: string, raw: string): Promise<string | undefined> {
    const [record] = await this.db
      .select()
      .from(verificationTokens)
      .where(
        and(
          eq(verificationTokens.type, type),
          eq(verificationTokens.identifier, identifier),
          isNull(verificationTokens.consumedAt),
        ),
      )
      .orderBy(verificationTokens.createdAt)
      .limit(1);

    if (!record) return undefined;
    if (record.expiresAt.getTime() < Date.now()) return undefined;
    if (record.attempts >= MAX_VERIFY_ATTEMPTS) return undefined;

    const matches = this.tokenService.hashOpaqueToken(raw) === record.tokenHash;

    if (!matches) {
      await this.db
        .update(verificationTokens)
        .set({ attempts: record.attempts + 1 })
        .where(eq(verificationTokens.id, record.id));
      return undefined;
    }

    await this.db
      .update(verificationTokens)
      .set({ consumedAt: new Date() })
      .where(eq(verificationTokens.id, record.id));

    return record.userId;
  }

  /**
   * For flows where the client only holds the raw token (a magic link),
   * not the identifier it was issued to (email verification, password
   * reset). Numeric OTPs deliberately do NOT use this path — those are
   * low-entropy and must stay scoped to a known identifier to resist
   * brute-forcing across all users; see `verify()`.
   */
  async verifyByRawToken(
    type: VerificationTokenType,
    raw: string,
  ): Promise<{ userId: string; identifier: string } | undefined> {
    const hash = this.tokenService.hashOpaqueToken(raw);
    const [record] = await this.db
      .select()
      .from(verificationTokens)
      .where(
        and(
          eq(verificationTokens.type, type),
          eq(verificationTokens.tokenHash, hash),
          isNull(verificationTokens.consumedAt),
        ),
      )
      .limit(1);

    if (!record) return undefined;
    if (record.expiresAt.getTime() < Date.now()) return undefined;

    await this.db
      .update(verificationTokens)
      .set({ consumedAt: new Date() })
      .where(eq(verificationTokens.id, record.id));

    return { userId: record.userId, identifier: record.identifier };
  }

  private async invalidateActive(userId: string, type: VerificationTokenType): Promise<void> {
    await this.db
      .update(verificationTokens)
      .set({ consumedAt: new Date() })
      .where(
        and(
          eq(verificationTokens.userId, userId),
          eq(verificationTokens.type, type),
          isNull(verificationTokens.consumedAt),
        ),
      );
  }
}
