import { BadRequestException, ConflictException } from '@nestjs/common';

import type { DrizzleDb } from '../database/database.types';
import type { LedgerAccount, Transaction } from '../database/schema';
import { chainable } from '../test-utils/mock-drizzle';
import { InsufficientFundsError } from './errors';
import { LedgerService } from './ledger.service';
import { TransactionService } from './transaction.service';
import { WalletService, type WalletAccounts } from './wallet.service';

const NOW = new Date();

function account(overrides: Partial<LedgerAccount> = {}): LedgerAccount {
  return {
    id: 'acct-available',
    walletId: 'wallet-1',
    ownerType: 'user',
    kind: 'available',
    systemKey: null,
    currency: 'USD',
    balance: 0n,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  } as LedgerAccount;
}

function walletAccounts(): WalletAccounts {
  return {
    wallet: { id: 'wallet-1', userId: 'user-1', currency: 'USD', createdAt: NOW },
    available: account({ id: 'acct-available', kind: 'available' }),
    locked: account({ id: 'acct-locked', kind: 'locked' }),
  };
}

function txRow(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: 'tx-1',
    idempotencyKey: null,
    type: 'deposit',
    status: 'posted',
    currency: 'USD',
    totalAmount: 100n,
    actorType: 'user',
    actorUserId: null,
    subjectUserId: 'user-1',
    reason: null,
    relatedType: null,
    relatedId: null,
    reversalOfTransactionId: null,
    metadata: null,
    createdAt: NOW,
    postedAt: NOW,
    ...overrides,
  } as Transaction;
}

interface Harness {
  service: TransactionService;
  db: { transaction: jest.Mock; select: jest.Mock };
  tx: { insert: jest.Mock; select: jest.Mock; update: jest.Mock };
  walletService: { getOrCreateWalletAccounts: jest.Mock; getSystemAccount: jest.Mock };
  ledgerService: { postEntries: jest.Mock };
}

function makeHarness(options: { existingByIdempotencyKey?: Transaction | undefined } = {}): Harness {
  const insertedTxRow = txRow();
  const tx = {
    insert: jest.fn().mockReturnValue(chainable([insertedTxRow])),
    select: jest.fn(),
    update: jest.fn().mockReturnValue(chainable(undefined)),
  };

  const db = {
    transaction: jest.fn(async (cb: (tx: unknown) => unknown) => cb(tx)),
    select: jest.fn().mockReturnValue(chainable(options.existingByIdempotencyKey ? [options.existingByIdempotencyKey] : [])),
  };

  const walletService = {
    getOrCreateWalletAccounts: jest.fn().mockResolvedValue(walletAccounts()),
    getSystemAccount: jest
      .fn()
      .mockImplementation((_tx: unknown, systemKey: 'house_cash' | 'house_revenue' | 'house_liability') =>
        Promise.resolve(account({ id: `sys-${systemKey}`, ownerType: 'system', kind: 'system', systemKey })),
      ),
  };
  const ledgerService = { postEntries: jest.fn().mockResolvedValue(undefined) };
  const events = { emit: jest.fn() };

  const service = new TransactionService(
    db as unknown as DrizzleDb,
    walletService as unknown as WalletService,
    ledgerService as unknown as LedgerService,
    events as unknown as import('@nestjs/event-emitter').EventEmitter2,
  );

  return { service, db, tx, walletService, ledgerService };
}

describe('TransactionService', () => {
  describe('deposit', () => {
    it('credits the wallet via a debit to house_cash / credit to available', async () => {
      const h = makeHarness();

      const result = await h.service.deposit({ userId: 'user-1', currency: 'USD', amount: 500n, actorType: 'system' });

      expect(result.id).toBe('tx-1');
      expect(h.ledgerService.postEntries).toHaveBeenCalledWith(
        h.tx,
        'tx-1',
        'USD',
        expect.arrayContaining([
          expect.objectContaining({ ledgerAccountId: 'sys-house_cash', direction: 'debit', amount: 500n }),
          expect.objectContaining({ ledgerAccountId: 'acct-available', direction: 'credit', amount: 500n }),
        ]),
      );
    });

    it('rejects a non-positive amount', async () => {
      const h = makeHarness();
      await expect(h.service.deposit({ userId: 'user-1', currency: 'USD', amount: 0n, actorType: 'system' })).rejects.toThrow(
        BadRequestException,
      );
      expect(h.db.transaction).not.toHaveBeenCalled();
    });
  });

  describe('withdraw', () => {
    it('debits available / credits house_cash', async () => {
      const h = makeHarness();
      await h.service.withdraw({ userId: 'user-1', currency: 'USD', amount: 300n, actorType: 'user', actorUserId: 'user-1' });

      expect(h.ledgerService.postEntries).toHaveBeenCalledWith(
        h.tx,
        'tx-1',
        'USD',
        expect.arrayContaining([
          expect.objectContaining({ ledgerAccountId: 'acct-available', direction: 'debit', amount: 300n }),
          expect.objectContaining({ ledgerAccountId: 'sys-house_cash', direction: 'credit', amount: 300n }),
        ]),
      );
    });

    it('propagates InsufficientFundsError from the ledger (and the caller sees a rejected transaction, not a partial one)', async () => {
      const h = makeHarness();
      h.ledgerService.postEntries.mockRejectedValue(
        new InsufficientFundsError({ accountId: 'acct-available', requested: 300n, available: 100n }),
      );

      await expect(
        h.service.withdraw({ userId: 'user-1', currency: 'USD', amount: 300n, actorType: 'user', actorUserId: 'user-1' }),
      ).rejects.toThrow(InsufficientFundsError);
    });
  });

  describe('placeBet', () => {
    it('moves stake from available to locked, purely internally', async () => {
      const h = makeHarness();
      await h.service.placeBet({ userId: 'user-1', currency: 'USD', amount: 50n, actorType: 'user', actorUserId: 'user-1' });

      expect(h.ledgerService.postEntries).toHaveBeenCalledWith(
        h.tx,
        'tx-1',
        'USD',
        [
          { ledgerAccountId: 'acct-available', direction: 'debit', amount: 50n },
          { ledgerAccountId: 'acct-locked', direction: 'credit', amount: 50n },
        ],
      );
      expect(h.walletService.getSystemAccount).not.toHaveBeenCalled();
    });
  });

  describe('refundBet', () => {
    it('moves the stake back from locked to available', async () => {
      const h = makeHarness();
      await h.service.refundBet({ userId: 'user-1', currency: 'USD', amount: 50n, actorType: 'system' });

      expect(h.ledgerService.postEntries).toHaveBeenCalledWith(h.tx, 'tx-1', 'USD', [
        { ledgerAccountId: 'acct-locked', direction: 'debit', amount: 50n },
        { ledgerAccountId: 'acct-available', direction: 'credit', amount: 50n },
      ]);
    });
  });

  describe('settleBetWin', () => {
    it('releases the stake and pays profit from house_liability when payout exceeds stake', async () => {
      const h = makeHarness();
      await h.service.settleBetWin({
        userId: 'user-1',
        currency: 'USD',
        stakeAmount: 100n,
        payoutAmount: 180n,
        actorType: 'system',
      });

      expect(h.ledgerService.postEntries).toHaveBeenCalledWith(h.tx, 'tx-1', 'USD', [
        { ledgerAccountId: 'acct-locked', direction: 'debit', amount: 100n },
        { ledgerAccountId: 'acct-available', direction: 'credit', amount: 180n },
        { ledgerAccountId: 'sys-house_liability', direction: 'debit', amount: 80n },
      ]);
    });

    it('omits the house_liability leg entirely when payout exactly equals stake (no profit)', async () => {
      const h = makeHarness();
      await h.service.settleBetWin({
        userId: 'user-1',
        currency: 'USD',
        stakeAmount: 100n,
        payoutAmount: 100n,
        actorType: 'system',
      });

      expect(h.ledgerService.postEntries).toHaveBeenCalledWith(h.tx, 'tx-1', 'USD', [
        { ledgerAccountId: 'acct-locked', direction: 'debit', amount: 100n },
        { ledgerAccountId: 'acct-available', direction: 'credit', amount: 100n },
      ]);
      expect(h.walletService.getSystemAccount).not.toHaveBeenCalled();
    });

    it('rejects a payout smaller than the stake', async () => {
      const h = makeHarness();
      await expect(
        h.service.settleBetWin({ userId: 'user-1', currency: 'USD', stakeAmount: 100n, payoutAmount: 50n, actorType: 'system' }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('settleBetLoss', () => {
    it('forfeits the locked stake to house_revenue', async () => {
      const h = makeHarness();
      await h.service.settleBetLoss({ userId: 'user-1', currency: 'USD', amount: 100n, actorType: 'system' });

      expect(h.ledgerService.postEntries).toHaveBeenCalledWith(h.tx, 'tx-1', 'USD', [
        { ledgerAccountId: 'acct-locked', direction: 'debit', amount: 100n },
        { ledgerAccountId: 'sys-house_revenue', direction: 'credit', amount: 100n },
      ]);
    });
  });

  describe('grantBonus / chargeFee', () => {
    it('funds a bonus from house_liability', async () => {
      const h = makeHarness();
      await h.service.grantBonus({
        userId: 'user-1',
        currency: 'USD',
        amount: 25n,
        actorType: 'admin',
        actorUserId: 'admin-1',
        reason: 'welcome bonus',
      });

      expect(h.ledgerService.postEntries).toHaveBeenCalledWith(h.tx, 'tx-1', 'USD', [
        { ledgerAccountId: 'sys-house_liability', direction: 'debit', amount: 25n },
        { ledgerAccountId: 'acct-available', direction: 'credit', amount: 25n },
      ]);
    });

    it('rejects a bonus grant with no reason', async () => {
      const h = makeHarness();
      await expect(
        h.service.grantBonus({ userId: 'user-1', currency: 'USD', amount: 25n, actorType: 'admin', actorUserId: 'admin-1' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('routes a fee to house_revenue', async () => {
      const h = makeHarness();
      await h.service.chargeFee({ userId: 'user-1', currency: 'USD', amount: 5n, actorType: 'system' });

      expect(h.ledgerService.postEntries).toHaveBeenCalledWith(h.tx, 'tx-1', 'USD', [
        { ledgerAccountId: 'acct-available', direction: 'debit', amount: 5n },
        { ledgerAccountId: 'sys-house_revenue', direction: 'credit', amount: 5n },
      ]);
    });
  });

  describe('adjustBalance', () => {
    it('requires a reason', async () => {
      const h = makeHarness();
      await expect(
        h.service.adjustBalance({
          userId: 'user-1',
          currency: 'USD',
          amount: 10n,
          direction: 'credit',
          reason: '',
          actorType: 'admin',
          actorUserId: 'admin-1',
        }),
      ).rejects.toThrow(BadRequestException);
      expect(h.db.transaction).not.toHaveBeenCalled();
    });

    it('credits the user from house_liability when direction is credit', async () => {
      const h = makeHarness();
      await h.service.adjustBalance({
        userId: 'user-1',
        currency: 'USD',
        amount: 10n,
        direction: 'credit',
        reason: 'goodwill credit',
        actorType: 'admin',
        actorUserId: 'admin-1',
      });

      expect(h.ledgerService.postEntries).toHaveBeenCalledWith(h.tx, 'tx-1', 'USD', [
        { ledgerAccountId: 'sys-house_liability', direction: 'debit', amount: 10n },
        { ledgerAccountId: 'acct-available', direction: 'credit', amount: 10n },
      ]);
    });

    it('debits the user to house_revenue when direction is debit', async () => {
      const h = makeHarness();
      await h.service.adjustBalance({
        userId: 'user-1',
        currency: 'USD',
        amount: 10n,
        direction: 'debit',
        reason: 'correcting duplicate credit',
        actorType: 'admin',
        actorUserId: 'admin-1',
      });

      expect(h.ledgerService.postEntries).toHaveBeenCalledWith(h.tx, 'tx-1', 'USD', [
        { ledgerAccountId: 'acct-available', direction: 'debit', amount: 10n },
        { ledgerAccountId: 'sys-house_revenue', direction: 'credit', amount: 10n },
      ]);
    });
  });

  describe('idempotency', () => {
    it('returns the existing transaction on a duplicate request without re-executing the mutation', async () => {
      const existing = txRow({ id: 'already-processed', idempotencyKey: 'key-1' });
      const h = makeHarness({ existingByIdempotencyKey: existing });

      const result = await h.service.deposit({
        userId: 'user-1',
        currency: 'USD',
        amount: 500n,
        actorType: 'user',
        actorUserId: 'user-1',
        idempotencyKey: 'key-1',
      });

      expect(result).toBe(existing);
      expect(h.db.transaction).not.toHaveBeenCalled();
      expect(h.ledgerService.postEntries).not.toHaveBeenCalled();
    });

    it('recovers from a concurrent duplicate insert (unique-violation race) by returning the winner instead of throwing', async () => {
      const h = makeHarness();
      const winnerRow = txRow({ id: 'winner', idempotencyKey: 'key-2' });

      h.db.transaction.mockImplementationOnce(async () => {
        const err = new Error('duplicate key value violates unique constraint') as Error & { code: string };
        err.code = '23505';
        throw err;
      });
      // After the race is detected, the service re-queries by idempotency key.
      h.db.select.mockReturnValueOnce(chainable([winnerRow]));

      const result = await h.service.deposit({
        userId: 'user-1',
        currency: 'USD',
        amount: 500n,
        actorType: 'user',
        actorUserId: 'user-1',
        idempotencyKey: 'key-2',
      });

      expect(result).toBe(winnerRow);
    });

    it('does not swallow unrelated errors as if they were idempotency races', async () => {
      const h = makeHarness();
      h.db.transaction.mockImplementationOnce(async () => {
        throw new Error('connection reset');
      });

      await expect(
        h.service.deposit({
          userId: 'user-1',
          currency: 'USD',
          amount: 500n,
          actorType: 'user',
          actorUserId: 'user-1',
          idempotencyKey: 'key-3',
        }),
      ).rejects.toThrow('connection reset');
    });
  });

  describe('transaction rollback', () => {
    it('propagates a ledger failure out of the DB transaction (so drizzle rolls it back) instead of returning a partial result', async () => {
      const h = makeHarness();
      h.ledgerService.postEntries.mockRejectedValue(new Error('ledger post failed'));

      await expect(
        h.service.deposit({ userId: 'user-1', currency: 'USD', amount: 500n, actorType: 'system' }),
      ).rejects.toThrow('ledger post failed');
    });
  });

  describe('holdForWithdrawal', () => {
    it('reserves the stake purely internally (available -> locked), never touching a house account', async () => {
      const h = makeHarness();
      await h.service.holdForWithdrawal({ userId: 'user-1', currency: 'USD', amount: 200n, actorType: 'user', actorUserId: 'user-1' });

      expect(h.ledgerService.postEntries).toHaveBeenCalledWith(h.tx, 'tx-1', 'USD', [
        { ledgerAccountId: 'acct-available', direction: 'debit', amount: 200n },
        { ledgerAccountId: 'acct-locked', direction: 'credit', amount: 200n },
      ]);
      expect(h.walletService.getSystemAccount).not.toHaveBeenCalled();
    });

    it('propagates InsufficientFundsError without posting anything', async () => {
      const h = makeHarness();
      h.ledgerService.postEntries.mockRejectedValue(new InsufficientFundsError({ accountId: 'acct-available', requested: 200n, available: 50n }));

      await expect(
        h.service.holdForWithdrawal({ userId: 'user-1', currency: 'USD', amount: 200n, actorType: 'user', actorUserId: 'user-1' }),
      ).rejects.toThrow(InsufficientFundsError);
    });
  });

  describe('releaseWithdrawalHold', () => {
    it('returns a held reservation back to available', async () => {
      const h = makeHarness();
      await h.service.releaseWithdrawalHold({ userId: 'user-1', currency: 'USD', amount: 200n, actorType: 'admin', actorUserId: 'admin-1', reason: 'rejected' });

      expect(h.ledgerService.postEntries).toHaveBeenCalledWith(h.tx, 'tx-1', 'USD', [
        { ledgerAccountId: 'acct-locked', direction: 'debit', amount: 200n },
        { ledgerAccountId: 'acct-available', direction: 'credit', amount: 200n },
      ]);
    });
  });

  describe('settleWithdrawal', () => {
    it('sends a held reservation out of the house (locked -> house_cash)', async () => {
      const h = makeHarness();
      await h.service.settleWithdrawal({ userId: 'user-1', currency: 'USD', amount: 200n, actorType: 'system' });

      expect(h.ledgerService.postEntries).toHaveBeenCalledWith(h.tx, 'tx-1', 'USD', [
        { ledgerAccountId: 'acct-locked', direction: 'debit', amount: 200n },
        { ledgerAccountId: 'sys-house_cash', direction: 'credit', amount: 200n },
      ]);
    });
  });

  describe('reverseCompletedWithdrawal', () => {
    it('rejects reversing a transaction that is not currently posted', async () => {
      const h = makeHarness();
      h.tx.select.mockReturnValueOnce(chainable([txRow({ status: 'reversed' })]));

      await expect(
        h.service.reverseCompletedWithdrawal({
          settlementTransactionId: 'tx-1',
          userId: 'user-1',
          currency: 'USD',
          amount: 200n,
          actorUserId: 'admin-1',
          reason: 'provider clawback',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('credits the amount straight back to available (not locked) and marks the original reversed', async () => {
      const h = makeHarness();
      h.tx.select.mockReturnValueOnce(chainable([txRow({ id: 'settle-1', type: 'withdrawal_settlement', status: 'posted' })]));

      await h.service.reverseCompletedWithdrawal({
        settlementTransactionId: 'settle-1',
        userId: 'user-1',
        currency: 'USD',
        amount: 200n,
        actorUserId: 'admin-1',
        reason: 'provider clawback',
      });

      expect(h.ledgerService.postEntries).toHaveBeenCalledWith(h.tx, 'tx-1', 'USD', [
        { ledgerAccountId: 'sys-house_cash', direction: 'debit', amount: 200n },
        { ledgerAccountId: 'acct-available', direction: 'credit', amount: 200n },
      ]);
      // Two updates: setting reversalOfTransactionId on the new row, and status='reversed' on the original.
      expect(h.tx.update).toHaveBeenCalledTimes(2);
    });
  });

  describe('reverseTransaction', () => {
    it('rejects reversing a transaction that is not currently posted', async () => {
      const h = makeHarness();
      h.tx.select.mockReturnValueOnce(chainable([txRow({ status: 'reversed' })]));

      await expect(
        h.service.reverseTransaction({ transactionId: 'tx-1', actorUserId: 'admin-1', reason: 'duplicate entry' }),
      ).rejects.toThrow(ConflictException);
    });

    it('posts negated entries and marks the original as reversed', async () => {
      const h = makeHarness();
      h.tx.select
        .mockReturnValueOnce(chainable([txRow({ id: 'orig-1', status: 'posted' })])) // original transaction lookup
        .mockReturnValueOnce(
          chainable([
            { ledgerAccountId: 'acct-available', direction: 'credit', amount: 500n },
            { ledgerAccountId: 'sys-house_cash', direction: 'debit', amount: 500n },
          ]),
        ); // original entries

      await h.service.reverseTransaction({ transactionId: 'orig-1', actorUserId: 'admin-1', reason: 'duplicate deposit' });

      expect(h.ledgerService.postEntries).toHaveBeenCalledWith(
        h.tx,
        'tx-1',
        'USD',
        [
          { ledgerAccountId: 'acct-available', direction: 'debit', amount: 500n },
          { ledgerAccountId: 'sys-house_cash', direction: 'credit', amount: 500n },
        ],
      );
      // Two updates: setting reversalOfTransactionId on the new row, and status='reversed' on the original.
      expect(h.tx.update).toHaveBeenCalledTimes(2);
    });
  });
});
