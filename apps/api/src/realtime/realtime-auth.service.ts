import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { and, eq, isNull } from 'drizzle-orm';

import { TokenService } from '../auth/services/token.service';
import { AuthorizationService } from '../authorization/authorization.service';
import type { RequestUser } from '../authorization/types/request-user';
import { DRIZZLE_CLIENT } from '../database/database.constants';
import type { DrizzleDb } from '../database/database.types';
import { sessions, users } from '../database/schema';

/**
 * WebSocket-handshake equivalent of `AuthGuard` — same validation steps
 * (token signature/type, session not revoked/expired, account active,
 * roles/permissions resolved fresh from the DB), just entered from a
 * socket handshake instead of an Express request, so a socket connection
 * carries no weaker a guarantee than an HTTP request would. Throws
 * `UnauthorizedException` on any failure; callers disconnect the socket.
 */
@Injectable()
export class RealtimeAuthService {
  constructor(
    private readonly tokenService: TokenService,
    private readonly authorizationService: AuthorizationService,
    @Inject(DRIZZLE_CLIENT) private readonly db: DrizzleDb,
  ) {}

  async authenticate(token: string | undefined): Promise<RequestUser> {
    if (!token) throw new UnauthorizedException('Missing auth token');

    const payload = this.tokenService.verifyAccessToken(token);

    const [session] = await this.db
      .select()
      .from(sessions)
      .where(and(eq(sessions.id, payload.sid), isNull(sessions.revokedAt)))
      .limit(1);
    if (!session || session.userId !== payload.sub) {
      throw new UnauthorizedException('Session is no longer valid');
    }
    if (session.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException('Session has expired');
    }

    const [user] = await this.db.select().from(users).where(eq(users.id, payload.sub)).limit(1);
    if (!user) throw new UnauthorizedException('User no longer exists');
    if (user.status !== 'active') throw new UnauthorizedException(`Account is ${user.status}`);

    const { roles, permissions } = await this.authorizationService.resolve(user.id);

    return {
      id: user.id,
      email: user.email,
      status: user.status,
      sessionId: session.id,
      roles,
      permissions,
    };
  }

  /** Re-validates a currently-connected socket's session — used by the backstop sweep. */
  async isSessionStillValid(sessionId: string, userId: string): Promise<boolean> {
    const [session] = await this.db
      .select()
      .from(sessions)
      .where(and(eq(sessions.id, sessionId), isNull(sessions.revokedAt)))
      .limit(1);
    if (!session || session.userId !== userId) return false;
    if (session.expiresAt.getTime() < Date.now()) return false;

    const [user] = await this.db.select().from(users).where(eq(users.id, userId)).limit(1);
    return !!user && user.status === 'active';
  }
}
