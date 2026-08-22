import { UnauthorizedException } from '@nestjs/common';

import type { TokenService } from '../auth/services/token.service';
import type { AuthorizationService } from '../authorization/authorization.service';
import type { DrizzleDb } from '../database/database.types';
import { chainable } from '../test-utils/mock-drizzle';
import { RealtimeAuthService } from './realtime-auth.service';

const futureDate = new Date(Date.now() + 60_000);
const pastDate = new Date(Date.now() - 60_000);

function makeService(options: {
  verifyAccessToken?: () => { sub: string; sid: string };
  session?: unknown;
  user?: unknown;
  permissions?: { roles: string[]; permissions: string[] };
}) {
  const tokenService = {
    verifyAccessToken: options.verifyAccessToken ?? (() => ({ sub: 'user-1', sid: 'session-1' })),
  } as unknown as TokenService;
  const authorizationService = {
    resolve: jest.fn().mockResolvedValue(options.permissions ?? { roles: [], permissions: [] }),
  } as unknown as AuthorizationService;

  const select = jest
    .fn()
    .mockReturnValueOnce(chainable(options.session === undefined ? [] : [options.session]))
    .mockReturnValueOnce(chainable(options.user === undefined ? [] : [options.user]));
  const db = { select } as unknown as DrizzleDb;

  return new RealtimeAuthService(tokenService, authorizationService, db);
}

describe('RealtimeAuthService — WebSocket-handshake equivalent of AuthGuard', () => {
  it('rejects a missing token', async () => {
    const service = makeService({});
    await expect(service.authenticate(undefined)).rejects.toThrow(UnauthorizedException);
  });

  it('rejects an invalid or expired token', async () => {
    const service = makeService({
      verifyAccessToken: () => {
        throw new UnauthorizedException('Invalid or expired token');
      },
    });
    await expect(service.authenticate('garbage')).rejects.toThrow(UnauthorizedException);
  });

  it('rejects when the session has been revoked (not found by the revoked-aware query)', async () => {
    const service = makeService({ session: undefined });
    await expect(service.authenticate('valid')).rejects.toThrow(UnauthorizedException);
  });

  it('rejects when the session has expired', async () => {
    const service = makeService({
      session: { id: 'session-1', userId: 'user-1', expiresAt: pastDate, revokedAt: null },
    });
    await expect(service.authenticate('valid')).rejects.toThrow(UnauthorizedException);
  });

  it('rejects a suspended account', async () => {
    const service = makeService({
      session: { id: 'session-1', userId: 'user-1', expiresAt: futureDate, revokedAt: null },
      user: { id: 'user-1', email: 'a@example.com', status: 'suspended' },
    });
    await expect(service.authenticate('valid')).rejects.toThrow(UnauthorizedException);
  });

  it('resolves fresh roles/permissions for a valid active-account token — never trusting anything baked into the JWT', async () => {
    const service = makeService({
      session: { id: 'session-1', userId: 'user-1', expiresAt: futureDate, revokedAt: null },
      user: { id: 'user-1', email: 'a@example.com', status: 'active' },
      permissions: { roles: ['support'], permissions: ['users.view'] },
    });

    await expect(service.authenticate('valid')).resolves.toEqual({
      id: 'user-1',
      email: 'a@example.com',
      status: 'active',
      sessionId: 'session-1',
      roles: ['support'],
      permissions: ['users.view'],
    });
  });

  it('isSessionStillValid reflects revocation for the backstop sweep', async () => {
    const service = makeService({ session: undefined });
    await expect(service.isSessionStillValid('session-1', 'user-1')).resolves.toBe(false);
  });

  it('isSessionStillValid is true for a live session on an active account', async () => {
    const service = makeService({
      session: { id: 'session-1', userId: 'user-1', expiresAt: futureDate, revokedAt: null },
      user: { id: 'user-1', status: 'active' },
    });
    await expect(service.isSessionStillValid('session-1', 'user-1')).resolves.toBe(true);
  });
});
