import type { DrizzleDb } from '../../database/database.types';
import { chainable } from '../../test-utils/mock-drizzle';
import type { TokenService } from './token.service';
import { VerificationTokenService } from './verification-token.service';

function makeTokenService(): TokenService {
  return {
    generateNumericOtp: () => '123456',
    generateOpaqueToken: () => ({ raw: 'raw-token', hash: 'hash-of-raw-token' }),
    hashOpaqueToken: (raw: string) => `hash-of-${raw}`,
  } as unknown as TokenService;
}

describe('VerificationTokenService', () => {
  it('issues an OTP and stores only its hash', async () => {
    const update = jest.fn().mockReturnValue(chainable(undefined));
    const insert = jest.fn().mockReturnValue(chainable(undefined));
    const db = { update, insert } as unknown as DrizzleDb;
    const service = new VerificationTokenService(db, makeTokenService());

    const code = await service.issueOtp('user-1', 'phone_otp', '+14155551234', 10);
    expect(code).toBe('123456');
    expect(insert).toHaveBeenCalled();
  });

  it('verify() returns undefined when no active token exists', async () => {
    const select = jest.fn().mockReturnValue(chainable([]));
    const db = { select } as unknown as DrizzleDb;
    const service = new VerificationTokenService(db, makeTokenService());

    await expect(service.verify('email_verification', 'a@example.com', 'raw-token')).resolves.toBeUndefined();
  });

  it('verify() returns undefined and increments attempts on a wrong code', async () => {
    const record = {
      id: 'tok-1',
      userId: 'user-1',
      tokenHash: 'hash-of-correct',
      expiresAt: new Date(Date.now() + 60_000),
      attempts: 0,
    };
    const select = jest.fn().mockReturnValue(chainable([record]));
    const updateChain = chainable(undefined);
    const update = jest.fn().mockReturnValue(updateChain);
    const db = { select, update } as unknown as DrizzleDb;
    const service = new VerificationTokenService(db, makeTokenService());

    const result = await service.verify('phone_otp', '+14155551234', 'wrong-code');
    expect(result).toBeUndefined();
    expect(updateChain.set).toHaveBeenCalledWith(expect.objectContaining({ attempts: 1 }));
  });

  it('verify() consumes a matching token and returns the owning userId', async () => {
    const record = {
      id: 'tok-1',
      userId: 'user-1',
      tokenHash: 'hash-of-raw-token',
      expiresAt: new Date(Date.now() + 60_000),
      attempts: 0,
    };
    const select = jest.fn().mockReturnValue(chainable([record]));
    const updateChain = chainable(undefined);
    const update = jest.fn().mockReturnValue(updateChain);
    const db = { select, update } as unknown as DrizzleDb;
    const service = new VerificationTokenService(db, makeTokenService());

    const result = await service.verify('phone_otp', '+14155551234', 'raw-token');
    expect(result).toBe('user-1');
    expect(updateChain.set).toHaveBeenCalledWith(expect.objectContaining({ consumedAt: expect.any(Date) }));
  });

  it('verify() rejects an expired token', async () => {
    const record = {
      id: 'tok-1',
      userId: 'user-1',
      tokenHash: 'hash-of-raw-token',
      expiresAt: new Date(Date.now() - 1000),
      attempts: 0,
    };
    const select = jest.fn().mockReturnValue(chainable([record]));
    const db = { select } as unknown as DrizzleDb;
    const service = new VerificationTokenService(db, makeTokenService());

    await expect(service.verify('phone_otp', '+14155551234', 'raw-token')).resolves.toBeUndefined();
  });

  it('verify() locks out after too many attempts even with the right code', async () => {
    const record = {
      id: 'tok-1',
      userId: 'user-1',
      tokenHash: 'hash-of-raw-token',
      expiresAt: new Date(Date.now() + 60_000),
      attempts: 5,
    };
    const select = jest.fn().mockReturnValue(chainable([record]));
    const db = { select } as unknown as DrizzleDb;
    const service = new VerificationTokenService(db, makeTokenService());

    await expect(service.verify('phone_otp', '+14155551234', 'raw-token')).resolves.toBeUndefined();
  });
});
