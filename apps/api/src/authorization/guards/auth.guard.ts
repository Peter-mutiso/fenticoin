import {
  ForbiddenException,
  Inject,
  Injectable,
  type CanActivate,
  type ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
// Value imports below (Reflector, TokenService, AuthorizationService): all
// three are constructor-injected without an explicit `@Inject()` token, so
// Nest resolves them by type via emitted metadata — see eslint.config.js.
import { Reflector } from '@nestjs/core';
import { and, eq, isNull } from 'drizzle-orm';
import type { Request } from 'express';

import { TokenService } from '../../auth/services/token.service';
import { DRIZZLE_CLIENT } from '../../database/database.constants';
import type { DrizzleDb } from '../../database/database.types';
import { sessions, users } from '../../database/schema';
import { AuthorizationService } from '../authorization.service';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import type { RequestUser } from '../types/request-user';

/**
 * Runs on every request unless `@Public()`. Verifies the access token,
 * confirms the session it names is still valid (not revoked/expired —
 * this is what makes logout/revocation actually work, since the JWT
 * itself has no revocation mechanism), confirms the account is not
 * suspended/banned, and attaches freshly-resolved roles/permissions to
 * `req.user`. Nothing about authorization is ever inferred from the
 * frontend — a missing/invalid/expired token or a non-active account is
 * rejected here, server-side, before any handler runs.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokenService: TokenService,
    private readonly authorizationService: AuthorizationService,
    @Inject(DRIZZLE_CLIENT) private readonly db: DrizzleDb,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<Request & { user?: RequestUser }>();
    const token = extractBearerToken(request.headers.authorization) ?? readCookie(request, 'fenticoin_access_token');
    if (!token) throw new UnauthorizedException('Missing bearer token');

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
    if (!user) {
      throw new UnauthorizedException('User no longer exists');
    }
    if (user.status !== 'active') {
      throw new ForbiddenException(`Account is ${user.status}`);
    }

    const { roles, permissions } = await this.authorizationService.resolve(user.id);

    request.user = {
      id: user.id,
      email: user.email,
      status: user.status,
      sessionId: session.id,
      roles,
      permissions,
    };

    return true;
  }
}

function extractBearerToken(header: string | undefined): string | undefined {
  if (!header?.startsWith('Bearer ')) return undefined;
  return header.slice('Bearer '.length).trim() || undefined;
}

function readCookie(request: Request, name: string): string | undefined {
  const header = request.headers.cookie;
  if (!header) return undefined;
  const value = header.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${name}=`));
  return value ? decodeURIComponent(value.slice(name.length + 1)) : undefined;
}
