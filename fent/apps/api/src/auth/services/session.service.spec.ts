import type { AppConfigService } from '../../config/app-config.service';
import type { DrizzleDb } from '../../database/database.types';
import { chainable } from '../../test-utils/mock-drizzle';
import { SessionService } from './session.service';
import type { TokenService } from './token.service';

function makeTokenService(): TokenService {
  let counter = 0;
  return {
    generateOpaqueToken: () => {
      counter += 1;
      return { raw: `raw-${counter}`, hash: `hash-${counter}` };
    },
    hashOpaqueToken: (raw: string) => `hash-of-${raw}`,
  } as unknown as TokenService;
}

const config = { refreshTokenTtlDays: 30 } as AppConfigService;
const events = { emit: jest.fn() } as unknown as import('@nestjs/event-emitter').EventEmitter2;

describe('SessionService', () => {
  it('creates a session with a hashed refresh token', async () => {
    const insert = jest.fn().mockReturnValue(
      chainable([{ id: 'session-1', userId: 'user-1', refreshTokenHash: 'hash-1' }]),
    );
    const db = { insert } as unknown as DrizzleDb;
    const service = new SessionService(db, makeTokenService(), config, events);

    const { session, refreshTokenRaw } = await service.createSession('user-1', {});
    expect(session.id).toBe('session-1');
    expect(refreshTokenRaw).toBe('raw-1');
  });

  it('rotate() returns invalid for an unknown refresh token', async () => {
    const select = jest.fn().mockReturnValue(chainable([]));
    const db = { select } as unknown as DrizzleDb;
    const service = new SessionService(db, makeTokenService(), config, events);

    await expect(service.rotate('nope', {})).resolves.toEqual({ outcome: 'invalid' });
  });

  it('rotate() returns invalid for an expired session', async () => {
    const select = jest
      .fn()
      .mockReturnValue(
        chainable([{ id: 's1', userId: 'u1', revokedAt: null, expiresAt: new Date(Date.now() - 1000) }]),
      );
    const db = { select } as unknown as DrizzleDb;
    const service = new SessionService(db, makeTokenService(), config, events);

    await expect(service.rotate('raw', {})).resolves.toEqual({ outcome: 'invalid' });
  });

  it('rotate() detects reuse of an already-revoked token and revokes every session for the user', async () => {
    const select = jest
      .fn()
      .mockReturnValue(
        chainable([{ id: 's1', userId: 'u1', revokedAt: new Date(), expiresAt: new Date(Date.now() + 1000) }]),
      );
    const update = jest.fn().mockReturnValue(chainable(undefined));
    const db = { select, update } as unknown as DrizzleDb;
    const service = new SessionService(db, makeTokenService(), config, events);

    const result = await service.rotate('raw', {});
    expect(result).toEqual({ outcome: 'reused' });
    expect(update).toHaveBeenCalled();
  });

  it('rotate() issues a new session and revokes the old one on success', async () => {
    const select = jest
      .fn()
      .mockReturnValue(
        chainable([{ id: 's1', userId: 'u1', revokedAt: null, expiresAt: new Date(Date.now() + 1000) }]),
      );
    const insert = jest.fn().mockReturnValue(chainable([{ id: 's2', userId: 'u1' }]));
    const update = jest.fn().mockReturnValue(chainable(undefined));
    const db = { select, insert, update } as unknown as DrizzleDb;
    const service = new SessionService(db, makeTokenService(), config, events);

    const result = await service.rotate('raw', {});
    expect(result.outcome).toBe('rotated');
    if (result.outcome === 'rotated') {
      expect(result.session.id).toBe('s2');
    }
    expect(update).toHaveBeenCalled();
  });
});
