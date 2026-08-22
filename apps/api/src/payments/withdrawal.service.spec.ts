import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';

import type { AuditLogService } from '../audit/audit-log.service';
import type { Transaction, User, Withdrawal } from '../database/schema';
import type { DrizzleDb } from '../database/database.types';
import { InsufficientFundsError } from '../wallet/errors';
import type { TransactionService } from '../wallet/transaction.service';
import { chainable, type ChainableMock } from '../test-utils/mock-drizzle';
import type { PaymentService } from './payment.service';
import type { UsersService } from '../users/users.service';
import { WithdrawalEligibilityService } from './withdrawal-eligibility.service';
import { WithdrawalService } from './withdrawal.service';

const NOW = new Date();

function eligibleUser(overrides: Partial<User> = {}): User {
  return { id: 'user-1', status: 'active', eligibilityStatus: 'eligible', kycStatus: 'approved', ...overrides } as User;
}

function withdrawalRow(overrides: Partial<Withdrawal> = {}): Withdrawal {
  return {
    id: 'wd-1',
    userId: 'user-1',
    currency: 'USD',
    amount: 5_000n,
    status: 'pending_review',
    providerName: null,
    providerReference: null,
    holdTransactionId: 'hold-txn-1',
    releaseTransactionId: null,
    settlementTransactionId: null,
    reversalTransactionId: null,
    reviewedByUserId: null,
    reviewedAt: null,
    rejectionReason: null,
    failureReason: null,
    idempotencyKey: null,
    metadata: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  } as Withdrawal;
}

interface Harness {
  service: WithdrawalService;
  db: { transaction: jest.Mock; select: jest.Mock; update: jest.Mock };
  tx: { insert: jest.Mock; update: jest.Mock; select: jest.Mock };
  usersService: { findById: jest.Mock };
  paymentService: { providerName: string; createWithdrawal: jest.Mock; verifyWithdrawal: jest.Mock };
  transactionService: { holdForWithdrawal: jest.Mock; releaseWithdrawalHold: jest.Mock; settleWithdrawal: jest.Mock; reverseCompletedWithdrawal: jest.Mock };
  auditLog: { record: jest.Mock };
}

function makeHarness(): Harness {
  const tx = {
    insert: jest.fn().mockReturnValue(chainable([withdrawalRow()])),
    update: jest.fn(),
    select: jest.fn(),
  };
  const db = {
    transaction: jest.fn(async (cb: (tx: unknown) => unknown) => cb(tx)),
    select: jest.fn().mockReturnValue(chainable([])),
    update: jest.fn().mockReturnValue(chainable([])),
  };

  const usersService = { findById: jest.fn().mockResolvedValue(eligibleUser()) };
  const paymentService = {
    providerName: 'TestProvider',
    createWithdrawal: jest.fn().mockResolvedValue({ providerReference: 'wref-1', status: 'submitted' }),
    verifyWithdrawal: jest.fn(),
  };
  const transactionService = {
    holdForWithdrawal: jest.fn().mockResolvedValue({ id: 'hold-txn-1' } as Transaction),
    releaseWithdrawalHold: jest.fn().mockResolvedValue({ id: 'release-txn-1' } as Transaction),
    settleWithdrawal: jest.fn().mockResolvedValue({ id: 'settle-txn-1' } as Transaction),
    reverseCompletedWithdrawal: jest.fn().mockResolvedValue({ id: 'reversal-txn-1' } as Transaction),
  };
  const auditLog = { record: jest.fn() };
  const events = { emit: jest.fn() };

  const service = new WithdrawalService(
    db as unknown as DrizzleDb,
    usersService as unknown as UsersService,
    new WithdrawalEligibilityService(),
    paymentService as unknown as PaymentService,
    transactionService as unknown as TransactionService,
    auditLog as unknown as AuditLogService,
    events as unknown as import('@nestjs/event-emitter').EventEmitter2,
  );

  return { service, db, tx, usersService, paymentService, transactionService, auditLog };
}

function updateReturning(rows: unknown[]): ChainableMock {
  return chainable(rows);
}

describe('WithdrawalService', () => {
  describe('requestWithdrawal', () => {
    it('holds the funds and creates a pending_review withdrawal', async () => {
      const h = makeHarness();
      const result = await h.service.requestWithdrawal({ userId: 'user-1', currency: 'USD', amountMinorUnits: 5_000n });

      expect(h.transactionService.holdForWithdrawal).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'user-1', currency: 'USD', amount: 5_000n, relatedType: 'withdrawal' }),
        h.tx,
      );
      expect(result.status).toBe('pending_review');
    });

    it('rejects an ineligible user before touching the ledger at all', async () => {
      const h = makeHarness();
      h.usersService.findById.mockResolvedValue(eligibleUser({ kycStatus: 'unverified' }));

      await expect(h.service.requestWithdrawal({ userId: 'user-1', currency: 'USD', amountMinorUnits: 5_000n })).rejects.toThrow(
        ForbiddenException,
      );
      expect(h.db.transaction).not.toHaveBeenCalled();
    });

    it('rejects an amount below the minimum', async () => {
      const h = makeHarness();
      await expect(h.service.requestWithdrawal({ userId: 'user-1', currency: 'USD', amountMinorUnits: 1n })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects an amount above the maximum', async () => {
      const h = makeHarness();
      await expect(
        h.service.requestWithdrawal({ userId: 'user-1', currency: 'USD', amountMinorUnits: 1_000_000_000n }),
      ).rejects.toThrow(BadRequestException);
    });

    it('propagates insufficient funds from the ledger without creating a dangling withdrawal', async () => {
      const h = makeHarness();
      h.transactionService.holdForWithdrawal.mockRejectedValue(
        new InsufficientFundsError({ accountId: 'acct-1', requested: 5_000n, available: 100n }),
      );
      await expect(h.service.requestWithdrawal({ userId: 'user-1', currency: 'USD', amountMinorUnits: 5_000n })).rejects.toThrow(
        InsufficientFundsError,
      );
    });

    it('returns the existing withdrawal on a duplicate request without re-holding funds', async () => {
      const h = makeHarness();
      h.db.select.mockReturnValueOnce(chainable([withdrawalRow({ idempotencyKey: 'key-1' })]));

      const result = await h.service.requestWithdrawal({ userId: 'user-1', currency: 'USD', amountMinorUnits: 5_000n, idempotencyKey: 'key-1' });
      expect(result.idempotencyKey).toBe('key-1');
      expect(h.transactionService.holdForWithdrawal).not.toHaveBeenCalled();
    });
  });

  describe('reviewWithdrawal — reject', () => {
    it('releases the held funds and records the rejection reason', async () => {
      const h = makeHarness();
      h.db.select.mockReturnValueOnce(chainable([withdrawalRow()])); // getById
      h.tx.update
        .mockReturnValueOnce(updateReturning([withdrawalRow({ status: 'rejected', rejectionReason: 'suspicious activity' })])) // status update
        .mockReturnValueOnce(updateReturning([withdrawalRow({ status: 'rejected', releaseTransactionId: 'release-txn-1' })])); // link release tx

      const result = await h.service.reviewWithdrawal('wd-1', 'reject', 'admin-1', 'suspicious activity');

      expect(h.transactionService.releaseWithdrawalHold).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'user-1', amount: 5_000n, actorType: 'admin', actorUserId: 'admin-1' }),
        h.tx,
      );
      expect(result.status).toBe('rejected');
    });

    it('requires a reason', async () => {
      const h = makeHarness();
      h.db.select.mockReturnValueOnce(chainable([withdrawalRow()]));
      await expect(h.service.reviewWithdrawal('wd-1', 'reject', 'admin-1', '')).rejects.toThrow(BadRequestException);
    });
  });

  describe('reviewWithdrawal — approve', () => {
    it('approves and submits to the provider, moving to submitted', async () => {
      const h = makeHarness();
      h.db.select.mockReturnValueOnce(chainable([withdrawalRow()])); // getById
      h.db.update.mockReturnValueOnce(updateReturning([withdrawalRow({ status: 'approved' })])); // approve
      h.db.update.mockReturnValueOnce(
        updateReturning([withdrawalRow({ status: 'submitted', providerName: 'TestProvider', providerReference: 'wref-1' })]),
      ); // submission recorded

      const result = await h.service.reviewWithdrawal('wd-1', 'approve', 'admin-1');

      expect(h.paymentService.createWithdrawal).toHaveBeenCalledWith({ userId: 'user-1', currency: 'USD', amountMinorUnits: 5_000n });
      expect(result.status).toBe('submitted');
      expect(result.providerReference).toBe('wref-1');
    });

    it('releases the hold and fails the withdrawal when provider submission itself throws', async () => {
      const h = makeHarness();
      h.db.select.mockReturnValueOnce(chainable([withdrawalRow()]));
      h.db.update.mockReturnValueOnce(updateReturning([withdrawalRow({ status: 'approved' })]));
      h.paymentService.createWithdrawal.mockRejectedValue(new Error('provider network error'));
      h.tx.update
        .mockReturnValueOnce(updateReturning([withdrawalRow({ status: 'failed', failureReason: 'submission failed' })]))
        .mockReturnValueOnce(updateReturning([withdrawalRow({ status: 'failed', releaseTransactionId: 'release-txn-1' })]));

      const result = await h.service.reviewWithdrawal('wd-1', 'approve', 'admin-1');

      expect(result.status).toBe('failed');
      expect(h.transactionService.releaseWithdrawalHold).toHaveBeenCalled();
    });

    it('refuses to review a withdrawal that is not pending review', async () => {
      const h = makeHarness();
      h.db.select.mockReturnValueOnce(chainable([withdrawalRow({ status: 'completed' })]));
      await expect(h.service.reviewWithdrawal('wd-1', 'approve', 'admin-1')).rejects.toThrow(ConflictException);
    });
  });

  describe('verifyAndSettleWithdrawal — winning path', () => {
    it('settles (locked -> house_cash) only after independent provider verification confirms a matching amount', async () => {
      const h = makeHarness();
      h.db.select.mockReturnValueOnce(chainable([withdrawalRow({ status: 'submitted', providerReference: 'wref-1' })]));
      h.paymentService.verifyWithdrawal.mockResolvedValue({ status: 'completed', amountMinorUnits: 5_000n, currency: 'USD' });
      h.tx.update
        .mockReturnValueOnce(updateReturning([withdrawalRow({ status: 'completed' })]))
        .mockReturnValueOnce(updateReturning([withdrawalRow({ status: 'completed', settlementTransactionId: 'settle-txn-1' })]));

      const { withdrawal, wasAlreadyResolved } = await h.service.verifyAndSettleWithdrawal('wref-1');

      expect(h.transactionService.settleWithdrawal).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'user-1', amount: 5_000n, idempotencyKey: 'withdrawal_settlement:wd-1' }),
        h.tx,
      );
      expect(withdrawal.status).toBe('completed');
      expect(wasAlreadyResolved).toBe(false);
    });
  });

  describe('verifyAndSettleWithdrawal — duplicate callback', () => {
    it('is a no-op for a withdrawal already completed — never settles twice', async () => {
      const h = makeHarness();
      h.db.select.mockReturnValueOnce(chainable([withdrawalRow({ status: 'completed', settlementTransactionId: 'settle-txn-1' })]));

      const { wasAlreadyResolved } = await h.service.verifyAndSettleWithdrawal('wref-1');
      expect(wasAlreadyResolved).toBe(true);
      expect(h.paymentService.verifyWithdrawal).not.toHaveBeenCalled();
      expect(h.transactionService.settleWithdrawal).not.toHaveBeenCalled();
    });

    it('is a no-op for a withdrawal already failed', async () => {
      const h = makeHarness();
      h.db.select.mockReturnValueOnce(chainable([withdrawalRow({ status: 'failed' })]));
      const { wasAlreadyResolved } = await h.service.verifyAndSettleWithdrawal('wref-1');
      expect(wasAlreadyResolved).toBe(true);
    });
  });

  describe('verifyAndSettleWithdrawal — failed payment', () => {
    it('releases held funds when the provider independently reports failure', async () => {
      const h = makeHarness();
      h.db.select.mockReturnValueOnce(chainable([withdrawalRow({ status: 'submitted', providerReference: 'wref-1' })]));
      h.paymentService.verifyWithdrawal.mockResolvedValue({ status: 'failed', amountMinorUnits: 5_000n, currency: 'USD' });
      h.tx.update
        .mockReturnValueOnce(updateReturning([withdrawalRow({ status: 'failed' })]))
        .mockReturnValueOnce(updateReturning([withdrawalRow({ status: 'failed', releaseTransactionId: 'release-txn-1' })]));

      const { withdrawal } = await h.service.verifyAndSettleWithdrawal('wref-1');

      expect(withdrawal.status).toBe('failed');
      expect(h.transactionService.releaseWithdrawalHold).toHaveBeenCalled();
      expect(h.transactionService.settleWithdrawal).not.toHaveBeenCalled();
    });

    it('never settles just because the webhook claims success — a verified amount mismatch fails and releases instead', async () => {
      const h = makeHarness();
      h.db.select.mockReturnValueOnce(chainable([withdrawalRow({ status: 'submitted', providerReference: 'wref-1', amount: 5_000n })]));
      h.paymentService.verifyWithdrawal.mockResolvedValue({ status: 'completed', amountMinorUnits: 1n, currency: 'USD' });
      h.tx.update
        .mockReturnValueOnce(updateReturning([withdrawalRow({ status: 'failed' })]))
        .mockReturnValueOnce(updateReturning([withdrawalRow({ status: 'failed', releaseTransactionId: 'release-txn-1' })]));

      const { withdrawal } = await h.service.verifyAndSettleWithdrawal('wref-1');
      expect(withdrawal.status).toBe('failed');
      expect(h.transactionService.settleWithdrawal).not.toHaveBeenCalled();
    });
  });

  describe('verifyAndSettleWithdrawal — unrecognized reference', () => {
    it('throws NotFoundException', async () => {
      const h = makeHarness();
      h.db.select.mockReturnValueOnce(chainable([]));
      await expect(h.service.verifyAndSettleWithdrawal('unknown-ref')).rejects.toThrow(NotFoundException);
    });
  });

  describe('reverseWithdrawal', () => {
    it('reverses a completed withdrawal, crediting the user back', async () => {
      const h = makeHarness();
      h.db.select.mockReturnValueOnce(chainable([withdrawalRow({ status: 'completed', settlementTransactionId: 'settle-txn-1' })]));
      h.db.update.mockReturnValueOnce(updateReturning([withdrawalRow({ status: 'reversed', reversalTransactionId: 'reversal-txn-1' })]));

      const result = await h.service.reverseWithdrawal('wd-1', 'admin-1', 'provider clawback');

      expect(h.transactionService.reverseCompletedWithdrawal).toHaveBeenCalledWith(
        expect.objectContaining({ settlementTransactionId: 'settle-txn-1', actorUserId: 'admin-1', reason: 'provider clawback' }),
      );
      expect(result.status).toBe('reversed');
    });

    it('refuses to reverse a withdrawal that is not completed', async () => {
      const h = makeHarness();
      h.db.select.mockReturnValueOnce(chainable([withdrawalRow({ status: 'submitted' })]));
      await expect(h.service.reverseWithdrawal('wd-1', 'admin-1', 'n/a')).rejects.toThrow(ConflictException);
    });
  });
});
