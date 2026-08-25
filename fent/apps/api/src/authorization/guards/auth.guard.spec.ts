import { ForbiddenException, UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';

import type { TokenService } from '../../auth/services/token.service';
import type { DrizzleDb } from '../../database/database.types';
import { chainable } from '../../test-utils/mock-drizzle';
import type { AuthorizationService } from '../authorization.service';
import { AuthGuard } from './auth.guard';

function createContext(headers: Record<string, string | undefined>): ExecutionContext {
  const request = { headers, user: undefined as unknown };
  return {
    switchToHttp: () => ({ getRequest: () => request, getResponse: () => ({}) }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as ExecutionContext & { __request: typeof request };
}

describe('AuthGuard', () => {
  const futureDate = new Date(Date.now() + 60_000);
  const pastDate = new Date(Date.now() - 60_000);

  function makeGuard(options: {
    isPublic?: boolean;
    verifyAccessToken?: () => { sub: string; sid: string };
    session?: unknown;
    user?: unknown;
    permissions?: { roles: string[]; permissions: string[] };
  }) {
    const reflector = { getAllAndOverride: () => options.isPublic ?? false } as unknown as Reflector;
    const tokenService = {
      verifyAccessToken:
        options.verifyAccessToken ?? (() => ({ sub: 'user-1', sid: 'session-1' })),
    } as unknown as TokenService;
    const authorizationService = {
      resolve: jest.fn().mockResolvedValue(options.permissions ?? { roles: [], permissions: [] }),
    } as unknown as AuthorizationService;

    const select = jest
      .fn()
      .mockReturnValueOnce(chainable(options.session === undefined ? [] : [options.session]))
      .mockReturnValueOnce(chainable(options.user === undefined ? [] : [options.user]));
    const db = { select } as unknown as DrizzleDb;

    const guard = new AuthGuard(reflector, tokenService, authorizationService, db);
    return { guard };
  }

  it('allows public routes without a token', async () => {
    const { guard } = makeGuard({ isPublic: true });
    const context = createContext({});
    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it('rejects a request with no Authorization header', async () => {
    const { guard } = makeGuard({});
    const context = createContext({});
    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });

  it('rejects an invalid or expired access token', async () => {
    const { guard } = makeGuard({
      verifyAccessToken: () => {
        throw new UnauthorizedException('Invalid or expired token');
      },
    });
    const context = createContext({ authorization: 'Bearer garbage' });
    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });

  it('rejects when the session has been revoked (not found by the revoked-aware query)', async () => {
    const { guard } = makeGuard({ session: undefined });
    const context = createContext({ authorization: 'Bearer valid' });
    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });

  it('rejects when the session has expired', async () => {
    const { guard } = makeGuard({
      session: { id: 'session-1', userId: 'user-1', expiresAt: pastDate, revokedAt: null },
    });
    const context = createContext({ authorization: 'Bearer valid' });
    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });

  it('rejects a suspended account with 403, not 401', async () => {
    const { guard } = makeGuard({
      session: { id: 'session-1', userId: 'user-1', expiresAt: futureDate, revokedAt: null },
      user: { id: 'user-1', email: 'a@example.com', status: 'suspended' },
    });
    const context = createContext({ authorization: 'Bearer valid' });
    await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
  });

  it('attaches the resolved user, roles, and permissions for a valid active-account request', async () => {
    const { guard } = makeGuard({
      session: { id: 'session-1', userId: 'user-1', expiresAt: futureDate, revokedAt: null },
      user: { id: 'user-1', email: 'a@example.com', status: 'active' },
      permissions: { roles: ['support'], permissions: ['users.view'] },
    });
    const context = createContext({ authorization: 'Bearer valid' }) as ExecutionContext & {
      switchToHttp: () => { getRequest: () => { user?: unknown } };
    };

    await expect(guard.canActivate(context)).resolves.toBe(true);
    const request = context.switchToHttp().getRequest();
    expect(request.user).toEqual({
      id: 'user-1',
      email: 'a@example.com',
      status: 'active',
      sessionId: 'session-1',
      roles: ['support'],
      permissions: ['users.view'],
    });
  });
});
