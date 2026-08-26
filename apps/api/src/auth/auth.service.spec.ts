import { ConflictException, ForbiddenException, UnauthorizedException } from '@nestjs/common';

import type { AuditLogService } from '../audit/audit-log.service';
import type { EncryptionService } from '../common/crypto/encryption.service';
import type { AppConfigService } from '../config/app-config.service';
import type { DrizzleDb } from '../database/database.types';
import type { User } from '../database/schema';
import { chainable } from '../test-utils/mock-drizzle';
import type { UsersService } from '../users/users.service';
import { AuthService } from './auth.service';
import type { EmailProvider } from './providers/email/email-provider.interface';
import type { OAuthProvider } from './providers/oauth/oauth-provider.interface';
import type { SmsProvider } from './providers/sms/sms-provider.interface';
import type { PasswordService } from './services/password.service';
import type { SessionService } from './services/session.service';
import type { TokenService } from './services/token.service';
import type { TwoFactorService } from './services/two-factor.service';
import type { VerificationTokenService } from './services/verification-token.service';

const NOW = new Date();

function baseUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user-1',
    email: 'user@example.com',
    emailVerifiedAt: null,
    phone: null,
    phoneVerifiedAt: null,
    status: 'active',
    kycStatus: 'unverified',
    eligibilityStatus: 'unknown',
    dateOfBirth: null,
    accountType: 'real',
    demoOfUserId: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

interface Harness {
  service: AuthService;
  db: { transaction: jest.Mock; select: jest.Mock; insert: jest.Mock; update: jest.Mock; delete: jest.Mock };
  usersService: { findByEmail: jest.Mock; findById: jest.Mock; normalizeEmail: (email: string) => string };
  passwordService: { hash: jest.Mock; verify: jest.Mock };
  tokenService: Partial<TokenService>;
  sessionService: { createSession: jest.Mock; rotate: jest.Mock; revoke: jest.Mock; revokeAllForUser: jest.Mock };
  auditLog: { record: jest.Mock };
  emailProvider: { send: jest.Mock };
}

function makeHarness(): Harness {
  const db = {
    transaction: jest.fn(async (cb: (tx: unknown) => unknown) => {
      const tx = {
        insert: jest.fn().mockReturnValue(chainable([baseUser()])),
      };
      return cb(tx);
    }),
    select: jest.fn(),
    insert: jest.fn(),
    update: jest.fn().mockReturnValue(chainable(undefined)),
    delete: jest.fn().mockReturnValue(chainable(undefined)),
  };

  const usersService = {
    normalizeEmail: (email: string) => email.trim().toLowerCase(),
    findByEmail: jest.fn(),
    findById: jest.fn(),
  };

  const passwordService = {
    hash: jest.fn().mockResolvedValue('hashed'),
    verify: jest.fn().mockResolvedValue(true),
  };

  const sessionService = {
    createSession: jest
      .fn()
      .mockResolvedValue({ session: { id: 'session-1', userId: 'user-1' }, refreshTokenRaw: 'refresh-raw' }),
    rotate: jest.fn(),
    revoke: jest.fn(),
    revokeAllForUser: jest.fn(),
  };

  const tokenService: Partial<TokenService> = {
    signAccessToken: jest.fn().mockReturnValue('access-token'),
    signTwoFactorChallengeToken: jest.fn().mockReturnValue('challenge-token'),
    verifyTwoFactorChallengeToken: jest.fn(),
    generateNumericOtp: jest.fn().mockReturnValue('123456'),
    generateOpaqueToken: jest.fn().mockReturnValue({ raw: 'raw', hash: 'hash' }),
    hashOpaqueToken: jest.fn().mockReturnValue('hash'),
  };

  const auditLog = { record: jest.fn().mockResolvedValue(undefined) };
  const emailProvider = { send: jest.fn().mockResolvedValue(undefined) };

  const service = new AuthService(
    db as unknown as DrizzleDb,
    usersService as unknown as UsersService,
    passwordService as unknown as PasswordService,
    tokenService as TokenService,
    sessionService as unknown as SessionService,
    {} as TwoFactorService,
    {} as EncryptionService,
    {
      issueOpaqueToken: jest.fn().mockResolvedValue('verify-token'),
      issueOtp: jest.fn().mockResolvedValue('123456'),
      verify: jest.fn(),
      verifyByRawToken: jest.fn(),
    } as unknown as VerificationTokenService,
    auditLog as unknown as AuditLogService,
    { appBaseUrl: 'http://localhost:3000' } as AppConfigService,
    { isConfigured: () => false } as unknown as OAuthProvider,
    { sendOtp: jest.fn() } as unknown as SmsProvider,
    emailProvider as unknown as EmailProvider,
  );

  return { service, db, usersService, passwordService, tokenService, sessionService, auditLog, emailProvider };
}

describe('AuthService', () => {
  describe('register', () => {
    it('creates a user, issues a session, and records an audit entry', async () => {
      const h = makeHarness();
      h.usersService.findByEmail.mockResolvedValue(undefined);

      const result = await h.service.register(
        { email: 'New@Example.com', password: 'a-very-long-password' },
        {},
      );

      expect(result.accessToken).toBe('access-token');
      expect(result.refreshToken).toBe('refresh-raw');
      expect(h.db.transaction).toHaveBeenCalled();
      expect(h.auditLog.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'user.registered' }));
      expect(h.emailProvider.send).toHaveBeenCalled();
    });

    it('rejects registration when the email is already taken', async () => {
      const h = makeHarness();
      h.usersService.findByEmail.mockResolvedValue(baseUser());

      await expect(
        h.service.register({ email: 'user@example.com', password: 'a-very-long-password' }, {}),
      ).rejects.toThrow(ConflictException);
      expect(h.db.transaction).not.toHaveBeenCalled();
    });

    it('rejects registration for an under-18 date of birth', async () => {
      const h = makeHarness();
      h.usersService.findByEmail.mockResolvedValue(undefined);
      const tooYoung = new Date();
      tooYoung.setFullYear(tooYoung.getFullYear() - 10);

      await expect(
        h.service.register(
          {
            email: 'kid@example.com',
            password: 'a-very-long-password',
            dateOfBirth: tooYoung.toISOString().slice(0, 10),
          },
          {},
        ),
      ).rejects.toThrow(ForbiddenException);
      expect(h.db.transaction).not.toHaveBeenCalled();
    });
  });

  describe('login', () => {
    it('rejects an unknown email without revealing whether the account exists', async () => {
      const h = makeHarness();
      h.usersService.findByEmail.mockResolvedValue(undefined);

      await expect(h.service.login({ email: 'nobody@example.com', password: 'x' }, {})).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('rejects a suspended account with 403', async () => {
      const h = makeHarness();
      h.usersService.findByEmail.mockResolvedValue(baseUser({ status: 'suspended' }));

      await expect(h.service.login({ email: 'user@example.com', password: 'x' }, {})).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('rejects an incorrect password', async () => {
      const h = makeHarness();
      h.usersService.findByEmail.mockResolvedValue(baseUser());
      h.db.select.mockReturnValue(chainable([{ passwordHash: 'hashed' }]));
      h.passwordService.verify.mockResolvedValue(false);

      await expect(h.service.login({ email: 'user@example.com', password: 'wrong' }, {})).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('issues a session on correct credentials with no 2FA enrolled', async () => {
      const h = makeHarness();
      h.usersService.findByEmail.mockResolvedValue(baseUser());
      h.db.select
        .mockReturnValueOnce(chainable([{ passwordHash: 'hashed' }])) // password identity
        .mockReturnValueOnce(chainable([])); // no 2FA method row

      const result = await h.service.login({ email: 'user@example.com', password: 'correct' }, {});
      expect('accessToken' in result && result.accessToken).toBe('access-token');
    });

    it('returns a two-factor challenge instead of a session when 2FA is enabled', async () => {
      const h = makeHarness();
      h.usersService.findByEmail.mockResolvedValue(baseUser());
      h.db.select
        .mockReturnValueOnce(chainable([{ passwordHash: 'hashed' }]))
        .mockReturnValueOnce(chainable([{ enabledAt: NOW }]));

      const result = await h.service.login({ email: 'user@example.com', password: 'correct' }, {});
      expect(result).toEqual({ twoFactorRequired: true, challengeToken: 'challenge-token' });
      expect(h.sessionService.createSession).not.toHaveBeenCalled();
    });
  });
});
