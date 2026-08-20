import { Inject, Injectable } from '@nestjs/common';
import { and, eq, isNull } from 'drizzle-orm';

// Value imports (AppConfigService, TokenService): constructor-injected
// without an explicit `@Inject()` token — see eslint.config.js.
import { AppConfigService } from '../../config/app-config.service';
import { DRIZZLE_CLIENT } from '../../database/database.constants';
import type { DrizzleDb } from '../../database/database.types';
import { type Session, type SessionRevokedReason, sessions } from '../../database/schema';
import { TokenService } from './token.service';

export interface SessionMeta {
  userAgent?: string;
  ipAddress?: string;
}

export type RotateResult =
  | { outcome: 'rotated'; session: Session; refreshTokenRaw: string }
  | { outcome: 'invalid' }
  | { outcome: 'reused' };

/**
 * Refresh tokens are opaque and rotate on every use (the client swaps its
 * current refresh token for a new one each time it refreshes an access
 * token). If a *revoked* refresh token is ever presented again — meaning
 * it was already rotated away, or explicitly revoked — that's a strong
 * signal it leaked, so every session for that user is torn down.
 */
@Injectable()
export class SessionService {
  constructor(
    @Inject(DRIZZLE_CLIENT) private readonly db: DrizzleDb,
    private readonly tokenService: TokenService,
    private readonly config: AppConfigService,
  ) {}

  async createSession(userId: string, meta: SessionMeta): Promise<{ session: Session; refreshTokenRaw: string }> {
    const { raw, hash } = this.tokenService.generateOpaqueToken();
    const expiresAt = new Date(Date.now() + this.config.refreshTokenTtlDays * 24 * 60 * 60 * 1000);

    const [session] = await this.db
      .insert(sessions)
      .values({
        userId,
        refreshTokenHash: hash,
        userAgent: meta.userAgent,
        ipAddress: meta.ipAddress,
        expiresAt,
      })
      .returning();

    return { session: session as Session, refreshTokenRaw: raw };
  }

  async rotate(refreshTokenRaw: string, meta: SessionMeta): Promise<RotateResult> {
    const hash = this.tokenService.hashOpaqueToken(refreshTokenRaw);
    const [session] = await this.db.select().from(sessions).where(eq(sessions.refreshTokenHash, hash)).limit(1);

    if (!session) return { outcome: 'invalid' };

    if (session.revokedAt) {
      // Presented a token that was already rotated away or revoked: treat
      // as compromise and nuke every session for this user.
      await this.revokeAllForUser(session.userId, 'rotation_reuse_detected');
      return { outcome: 'reused' };
    }

    if (session.expiresAt.getTime() < Date.now()) {
      return { outcome: 'invalid' };
    }

    const { session: next, refreshTokenRaw: nextRaw } = await this.createSession(session.userId, meta);

    await this.db
      .update(sessions)
      .set({ revokedAt: new Date(), revokedReason: 'rotated', replacedBySessionId: next.id })
      .where(eq(sessions.id, session.id));

    return { outcome: 'rotated', session: next, refreshTokenRaw: nextRaw };
  }

  async revoke(sessionId: string, reason: SessionRevokedReason): Promise<void> {
    await this.db
      .update(sessions)
      .set({ revokedAt: new Date(), revokedReason: reason })
      .where(and(eq(sessions.id, sessionId), isNull(sessions.revokedAt)));
  }

  async revokeAllForUser(userId: string, reason: SessionRevokedReason): Promise<void> {
    await this.db
      .update(sessions)
      .set({ revokedAt: new Date(), revokedReason: reason })
      .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)));
  }
}
