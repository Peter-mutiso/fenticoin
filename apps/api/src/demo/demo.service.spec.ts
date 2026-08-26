import { ConflictException, NotFoundException } from '@nestjs/common';

import type { AuditLogService } from '../audit/audit-log.service';
import type { AppConfigService } from '../config/app-config.service';
import type { DrizzleDb } from '../database/database.types';
import type { User } from '../database/schema';
import { chainable } from '../test-utils/mock-drizzle';
import type { UsersService } from '../users/users.service';
import type { SessionService } from '../auth/services/session.service';
import type { TokenService } from '../auth/services/token.service';
import type { TransactionService } from '../wallet/transaction.service';
import type { WalletService } from '../wallet/wallet.service';
import { DemoService } from './demo.service';

function realUser(overrides: Partial<User> = {}): User {
  return {
    id: 'real-user-1',
    email: 'trader@example.com',
    emailVerifiedAt: null,
    phone: null,
    phoneVerifiedAt: null,
    status: 'active',
    kycStatus: 'unverified',
    eligibilityStatus: 'unknown',
    dateOfBirth: null,
    accountType: 'real',
    demoOfUserId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function demoUser(overrides: Partial<User> = {}): User {
  return { ...realUser({ id: 'demo-user-1', email: 'demo+real-user-1@fenticoin.demo.internal', accountType: 'demo', demoOfUserId: 'real-user-1' }), ...overrides };
}

interface Harness {
  service: DemoService;
  db: { select: jest.Mock; transaction: jest.Mock };
  usersService: { findById: jest.Mock };
  walletService: { getOrCreateWalletAccounts: jest.Mock };
  transactionService: { adjustBalance: jest.Mock; refundBet: jest.Mock };
  sessionService: { createSession: jest.Mock };
  tokenService: { signAccessToken: jest.Mock };
  auditLog: { record: jest.Mock };
}

function makeHarness(options: { existingDemoShadow?: User; currentAvailableBalance?: bigint } = {}): Harness {
  const tx = {
    select: jest.fn(),
    insert: jest.fn(),
    delete: jest.fn(() => chainable(undefined)),
    update: jest.fn(() => chainable(undefined)),
  };

  const db = {
    select: jest.fn().mockReturnValue(chainable(options.existingDemoShadow ? [options.existingDemoShadow] : [])),
    transaction: jest.fn(async (cb: (tx: unknown) => unknown) => cb(tx)),
  };
  (db as unknown as { __tx: typeof tx }).__tx = tx;

  const usersService = { findById: jest.fn() };
  const walletService = {
    getOrCreateWalletAccounts: jest.fn().mockResolvedValue({
      wallet: { id: 'wallet-1' },
      available: { id: 'ledger-available', balance: options.currentAvailableBalance ?? 0n },
      locked: { id: 'ledger-locked', balance: 0n },
    }),
  };
  const transactionService = { adjustBalance: jest.fn().mockResolvedValue({}), refundBet: jest.fn().mockResolvedValue({}) };
  const sessionService = { createSession: jest.fn().mockResolvedValue({ session: { id: 'session-1' }, refreshTokenRaw: 'refresh-1' }) };
  const tokenService = { signAccessToken: jest.fn().mockReturnValue('access-1') };
  const auditLog = { record: jest.fn().mockResolvedValue(undefined) };
  const config = { demoCurrency: 'USD', demoInitialBalanceMinorUnits: 1_000_000 } as unknown as AppConfigService;
  const events = { emit: jest.fn() };

  const service = new DemoService(
    db as unknown as DrizzleDb,
    usersService as unknown as UsersService,
    walletService as unknown as WalletService,
    transactionService as unknown as TransactionService,
    sessionService as unknown as SessionService,
    tokenService as unknown as TokenService,
    auditLog as unknown as AuditLogService,
    config,
    events as never,
  );

  return { service, db: db as unknown as Harness['db'], usersService, walletService, transactionService, sessionService, tokenService, auditLog };
}

describe('DemoService', () => {
  describe('enterDemo', () => {
    it('rejects when the real user does not exist', async () => {
      const h = makeHarness();
      h.usersService.findById.mockResolvedValue(undefined);
      await expect(h.service.enterDemo('missing', {})).rejects.toThrow(NotFoundException);
    });

    it('refuses to let a demo account itself enter demo mode', async () => {
      const h = makeHarness();
      h.usersService.findById.mockResolvedValue(demoUser());
      await expect(h.service.enterDemo('demo-user-1', {})).rejects.toThrow(ConflictException);
    });

    it('provisions and funds a new demo shadow exactly once, then issues a session for it', async () => {
      const h = makeHarness({ existingDemoShadow: undefined });
      h.usersService.findById.mockResolvedValue(realUser());

      const tx = (h.db as unknown as { __tx: { insert: jest.Mock } }).__tx;
      tx.insert.mockReturnValue(chainable([demoUser()]));

      const result = await h.service.enterDemo('real-user-1', { ipAddress: '127.0.0.1' });

      // `adjustBalance` itself provisions the wallet/ledger accounts (see
      // `TransactionService`) — asserting that directly here would just be
      // testing a shared collaborator's own responsibility.
      expect(h.transactionService.adjustBalance).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'demo-user-1', direction: 'credit', amount: 1_000_000n, currency: 'USD' }),
        expect.anything(),
      );
      expect(h.sessionService.createSession).toHaveBeenCalledWith('demo-user-1', expect.anything());
      expect(h.tokenService.signAccessToken).toHaveBeenCalledWith('demo-user-1', 'session-1');
      expect(result).toEqual({
        accessToken: 'access-1',
        refreshToken: 'refresh-1',
        user: expect.objectContaining({ id: 'demo-user-1', accountType: 'demo' }),
      });
    });

    it('reuses an existing demo shadow instead of re-funding it', async () => {
      const h = makeHarness({ existingDemoShadow: demoUser() });
      h.usersService.findById.mockResolvedValue(realUser());

      await h.service.enterDemo('real-user-1', {});

      expect(h.walletService.getOrCreateWalletAccounts).not.toHaveBeenCalled();
      expect(h.transactionService.adjustBalance).not.toHaveBeenCalled();
      expect(h.sessionService.createSession).toHaveBeenCalledWith('demo-user-1', expect.anything());
    });
  });

  describe('resetDemo', () => {
    it("releases an open bet's stake via the real refund path, deletes bet/bot history, deactivates bots, and tops the balance up to the target", async () => {
      const h = makeHarness({ currentAvailableBalance: 700_000n }); // $7000 currently — $3000 short of the $10000 target
      const tx = (h.db as unknown as { __tx: { select: jest.Mock; delete: jest.Mock; update: jest.Mock } }).__tx;

      tx.select
        .mockReturnValueOnce(chainable([{ id: 'bet-1', status: 'open', stakeAmount: 500n, currency: 'USD' }])) // demo bets
        .mockReturnValueOnce(chainable([{ id: 'bot-1' }])); // demo bots

      await h.service.resetDemo('demo-user-1');

      expect(h.transactionService.refundBet).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'demo-user-1', currency: 'USD', amount: 500n, relatedId: 'bet-1' }),
        expect.anything(),
      );
      expect(tx.delete).toHaveBeenCalled();
      expect(tx.update).toHaveBeenCalled();
      // Never deletes ledger history — see the service's own doc comment on why.
      expect(h.transactionService.adjustBalance).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'demo-user-1', direction: 'credit', amount: 300_000n, currency: 'USD' }),
        expect.anything(),
      );
      expect(h.auditLog.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'demo.reset', targetId: 'demo-user-1' }));
    });

    it('debits down to the target when the demo balance is currently above it, and never refunds a settled bet', async () => {
      const h = makeHarness({ currentAvailableBalance: 1_500_000n }); // $15000 currently — $5000 over the $10000 target
      const tx = (h.db as unknown as { __tx: { select: jest.Mock } }).__tx;

      tx.select
        .mockReturnValueOnce(chainable([{ id: 'bet-1', status: 'lost', stakeAmount: 500n, currency: 'USD' }])) // already-settled bet
        .mockReturnValueOnce(chainable([])); // no bots

      await h.service.resetDemo('demo-user-1');

      expect(h.transactionService.refundBet).not.toHaveBeenCalled();
      expect(h.transactionService.adjustBalance).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'demo-user-1', direction: 'debit', amount: 500_000n, currency: 'USD' }),
        expect.anything(),
      );
    });

    it('skips the balance correction entirely when already exactly at the target', async () => {
      const h = makeHarness({ currentAvailableBalance: 1_000_000n });
      const tx = (h.db as unknown as { __tx: { select: jest.Mock } }).__tx;

      tx.select.mockReturnValueOnce(chainable([])).mockReturnValueOnce(chainable([]));

      await h.service.resetDemo('demo-user-1');

      expect(h.transactionService.adjustBalance).not.toHaveBeenCalled();
    });
  });
});
