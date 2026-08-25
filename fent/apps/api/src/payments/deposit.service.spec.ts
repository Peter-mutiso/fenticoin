import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';

import type { AuditLogService } from '../audit/audit-log.service';
import type { Deposit, Transaction, User } from '../database/schema';
import type { DrizzleDb } from '../database/database.types';
import { chainable, type ChainableMock } from '../test-utils/mock-drizzle';
import type { UsersService } from '../users/users.service';
import type { TransactionService } from '../wallet/transaction.service';
import { DepositEligibilityService } from './deposit-eligibility.service';
import { DepositService } from './deposit.service';
import type { PaymentService } from './payment.service';

const NOW = new Date();

function eligibleUser(overrides: Partial<User> = {}): User {
  return { id: 'user-1', status: 'active', eligibilityStatus: 'eligible', kycStatus: 'unverified', ...overrides } as User;
}

function depositRow(overrides: Partial<Deposit> = {}): Deposit {
  return {
    id: 'dep-1',
    userId: 'user-1',
    currency: 'USD',
    amount: 5_000n,
    status: 'pending',
    providerName: 'TestProvider',
    providerReference: 'ref-1',
    redirectUrl: 'https://provider.example/pay/ref-1',
    transactionId: null,
    failureReason: null,
    expiresAt: new Date(Date.now() + 30 * 60_000),
    idempotencyKey: null,
    metadata: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  } as Deposit;
}

interface Harness {
  service: DepositService;
  db: { transaction: jest.Mock; select: jest.Mock; insert: jest.Mock; update: jest.Mock };
  tx: { select: jest.Mock; update: jest.Mock; insert: jest.Mock };
  usersService: { findById: jest.Mock };
  paymentService: { providerName: string; createDeposit: jest.Mock; verifyDeposit: jest.Mock };
  transactionService: { deposit: jest.Mock };
  auditLog: { record: jest.Mock };
  events: { emit: jest.Mock };
}

function makeHarness(): Harness {
  const tx = { select: jest.fn(), update: jest.fn(), insert: jest.fn() };
  const db = {
    transaction: jest.fn(async (cb: (tx: unknown) => unknown) => cb(tx)),
    select: jest.fn().mockReturnValue(chainable([])),
    insert: jest.fn().mockReturnValue(chainable([depositRow()])),
    update: jest.fn().mockReturnValue(chainable([])),
  };

  const usersService = { findById: jest.fn().mockResolvedValue(eligibleUser()) };
  const paymentService = {
    providerName: 'TestProvider',
    createDeposit: jest.fn().mockResolvedValue({ providerReference: 'ref-1', redirectUrl: 'https://provider.example/pay/ref-1' }),
    verifyDeposit: jest.fn(),
  };
  const transactionService = { deposit: jest.fn().mockResolvedValue({ id: 'txn-1' } as Transaction) };
  const auditLog = { record: jest.fn() };
  const events = { emit: jest.fn() };

  const service = new DepositService(
    db as unknown as DrizzleDb,
    usersService as unknown as UsersService,
    new DepositEligibilityService(),
    paymentService as unknown as PaymentService,
    transactionService as unknown as TransactionService,
    auditLog as unknown as AuditLogService,
    events as unknown as import('@nestjs/event-emitter').EventEmitter2,
  );

  return { service, db, tx, usersService, paymentService, transactionService, auditLog, events };
}

function updateReturning(rows: unknown[]): ChainableMock {
  return chainable(rows);
}

describe('DepositService', () => {
  describe('initiateDeposit', () => {
    it('creates a pending deposit from the provider intent', async () => {
      const h = makeHarness();
      const result = await h.service.initiateDeposit({ userId: 'user-1', currency: 'USD', amountMinorUnits: 5_000n });

      expect(h.paymentService.createDeposit).toHaveBeenCalledWith({ userId: 'user-1', currency: 'USD', amountMinorUnits: 5_000n });
      expect(result.status).toBe('pending');
      expect(result.providerReference).toBe('ref-1');
    });

    it('rejects a non-positive amount without calling the provider', async () => {
      const h = makeHarness();
      await expect(h.service.initiateDeposit({ userId: 'user-1', currency: 'USD', amountMinorUnits: 0n })).rejects.toThrow(BadRequestException);
      expect(h.paymentService.createDeposit).not.toHaveBeenCalled();
    });

    it('rejects an ineligible user without calling the provider', async () => {
      const h = makeHarness();
      h.usersService.findById.mockResolvedValue(eligibleUser({ eligibilityStatus: 'ineligible' }));

      await expect(h.service.initiateDeposit({ userId: 'user-1', currency: 'USD', amountMinorUnits: 5_000n })).rejects.toThrow(
        'not eligible to deposit',
      );
      expect(h.paymentService.createDeposit).not.toHaveBeenCalled();
    });

    it('rejects when the user does not exist', async () => {
      const h = makeHarness();
      h.usersService.findById.mockResolvedValue(undefined);

      await expect(h.service.initiateDeposit({ userId: 'missing', currency: 'USD', amountMinorUnits: 5_000n })).rejects.toThrow(NotFoundException);
      expect(h.paymentService.createDeposit).not.toHaveBeenCalled();
    });

    it('propagates a "provider not configured" rejection rather than persisting anything', async () => {
      const h = makeHarness();
      h.paymentService.createDeposit.mockRejectedValue(new Error('Payment provider is not configured on this deployment'));

      await expect(h.service.initiateDeposit({ userId: 'user-1', currency: 'USD', amountMinorUnits: 5_000n })).rejects.toThrow(
        'not configured',
      );
      expect(h.db.insert).not.toHaveBeenCalled();
    });

    it('returns the existing deposit on a duplicate request without re-calling the provider', async () => {
      const h = makeHarness();
      h.db.select.mockReturnValueOnce(chainable([depositRow({ idempotencyKey: 'key-1' })]));

      const result = await h.service.initiateDeposit({ userId: 'user-1', currency: 'USD', amountMinorUnits: 5_000n, idempotencyKey: 'key-1' });

      expect(result.idempotencyKey).toBe('key-1');
      expect(h.paymentService.createDeposit).not.toHaveBeenCalled();
    });

    it('recovers from a concurrent duplicate insert (unique-violation race) by returning the winner', async () => {
      const h = makeHarness();
      const winner = depositRow({ id: 'dep-winner', idempotencyKey: 'key-2' });
      const err = Object.assign(new Error('duplicate key value violates unique constraint'), { code: '23505' });
      h.db.insert.mockReturnValueOnce({ values: () => ({ returning: () => Promise.reject(err) }) });
      h.db.select.mockReturnValueOnce(chainable([])).mockReturnValueOnce(chainable([winner]));

      const result = await h.service.initiateDeposit({ userId: 'user-1', currency: 'USD', amountMinorUnits: 5_000n, idempotencyKey: 'key-2' });
      expect(result).toBe(winner);
    });
  });

  describe('cancelDeposit', () => {
    it('cancels a pending deposit owned by the user', async () => {
      const h = makeHarness();
      h.db.update.mockReturnValueOnce(updateReturning([depositRow({ status: 'cancelled' })]));

      const result = await h.service.cancelDeposit('dep-1', 'user-1');
      expect(result.status).toBe('cancelled');
    });

    it('refuses to cancel a deposit that is not pending', async () => {
      const h = makeHarness();
      h.db.update.mockReturnValueOnce(updateReturning([])); // conditional update matched nothing
      h.db.select.mockReturnValueOnce(updateReturning([depositRow({ status: 'completed' })])); // getById fallback

      await expect(h.service.cancelDeposit('dep-1', 'user-1')).rejects.toThrow(ConflictException);
    });

    it('reports not-found rather than leaking that another user\'s deposit exists', async () => {
      const h = makeHarness();
      h.db.update.mockReturnValueOnce(updateReturning([]));
      h.db.select.mockReturnValueOnce(updateReturning([depositRow({ userId: 'someone-else' })]));

      await expect(h.service.cancelDeposit('dep-1', 'user-1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('verifyAndCompleteDeposit — winning path', () => {
    it('credits the wallet only after independent provider verification confirms a matching amount', async () => {
      const h = makeHarness();
      h.db.select.mockReturnValueOnce(chainable([depositRow()])); // getByProviderReference
      h.paymentService.verifyDeposit.mockResolvedValue({ status: 'completed', amountMinorUnits: 5_000n, currency: 'USD' });
      h.tx.update
        .mockReturnValueOnce(updateReturning([depositRow({ status: 'completed' })])) // claim
        .mockReturnValueOnce(updateReturning([depositRow({ status: 'completed', transactionId: 'txn-1' })])); // link

      const { deposit, wasAlreadyResolved } = await h.service.verifyAndCompleteDeposit('ref-1');

      expect(h.paymentService.verifyDeposit).toHaveBeenCalledWith('ref-1');
      expect(h.transactionService.deposit).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'user-1', amount: 5_000n, currency: 'USD', idempotencyKey: 'deposit_completion:dep-1' }),
        h.tx,
      );
      expect(deposit.status).toBe('completed');
      expect(wasAlreadyResolved).toBe(false);
    });
  });

  describe('verifyAndCompleteDeposit — duplicate callback', () => {
    it('is a no-op for a deposit already completed — does not credit the wallet again', async () => {
      const h = makeHarness();
      h.db.select.mockReturnValueOnce(chainable([depositRow({ status: 'completed', transactionId: 'txn-1' })]));

      const { deposit, wasAlreadyResolved } = await h.service.verifyAndCompleteDeposit('ref-1');

      expect(wasAlreadyResolved).toBe(true);
      expect(deposit.status).toBe('completed');
      expect(h.paymentService.verifyDeposit).not.toHaveBeenCalled();
      expect(h.transactionService.deposit).not.toHaveBeenCalled();
    });

    it('is a no-op for a deposit already failed', async () => {
      const h = makeHarness();
      h.db.select.mockReturnValueOnce(chainable([depositRow({ status: 'failed', failureReason: 'already handled' })]));

      const { wasAlreadyResolved } = await h.service.verifyAndCompleteDeposit('ref-1');
      expect(wasAlreadyResolved).toBe(true);
      expect(h.transactionService.deposit).not.toHaveBeenCalled();
    });
  });

  describe('verifyAndCompleteDeposit — lost claim race', () => {
    it('never double-credits when the atomic claim update loses to a concurrent completion (0 rows affected)', async () => {
      // Simulates exactly what happens in Postgres when two processes both
      // pass the "still pending" pre-check and both enter the completion
      // transaction: only one's `WHERE status = 'pending'` conditional
      // update actually matches a row. This is that losing side.
      const h = makeHarness();
      h.db.select.mockReturnValueOnce(chainable([depositRow()])); // pre-check saw it as pending
      h.paymentService.verifyDeposit.mockResolvedValue({ status: 'completed', amountMinorUnits: 5_000n, currency: 'USD' });
      h.tx.update.mockReturnValueOnce(updateReturning([])); // claim affects 0 rows — someone else already won it
      h.tx.select.mockReturnValueOnce(chainable([depositRow({ status: 'completed', transactionId: 'txn-1' })])); // re-read finds the winner's result

      const { deposit, wasAlreadyResolved } = await h.service.verifyAndCompleteDeposit('ref-1');

      expect(deposit.status).toBe('completed');
      expect(deposit.transactionId).toBe('txn-1');
      expect(wasAlreadyResolved).toBe(false); // this caller's pre-check saw pending — it just lost the internal race
      expect(h.transactionService.deposit).not.toHaveBeenCalled();
    });
  });

  describe('verifyAndCompleteDeposit — failed payment', () => {
    it('marks the deposit failed when the provider independently reports failure, without touching the ledger', async () => {
      const h = makeHarness();
      h.db.select.mockReturnValueOnce(chainable([depositRow()]));
      h.paymentService.verifyDeposit.mockResolvedValue({ status: 'failed', amountMinorUnits: 5_000n, currency: 'USD' });
      h.db.update.mockReturnValueOnce(updateReturning([depositRow({ status: 'failed', failureReason: 'Provider reported this deposit as failed' })]));

      const { deposit, wasAlreadyResolved } = await h.service.verifyAndCompleteDeposit('ref-1');

      expect(deposit.status).toBe('failed');
      expect(wasAlreadyResolved).toBe(false);
      expect(h.transactionService.deposit).not.toHaveBeenCalled();
    });

    it('never credits the wallet just because the webhook claims success — a verified amount mismatch fails the deposit instead', async () => {
      const h = makeHarness();
      h.db.select.mockReturnValueOnce(chainable([depositRow({ amount: 5_000n })]));
      // Provider verification reports a DIFFERENT amount than what was recorded at initiation.
      h.paymentService.verifyDeposit.mockResolvedValue({ status: 'completed', amountMinorUnits: 1n, currency: 'USD' });
      h.db.update.mockReturnValueOnce(updateReturning([depositRow({ status: 'failed', failureReason: 'mismatch' })]));

      const { deposit } = await h.service.verifyAndCompleteDeposit('ref-1');

      expect(deposit.status).toBe('failed');
      expect(h.transactionService.deposit).not.toHaveBeenCalled();
    });

    it('leaves the deposit pending when the provider itself still reports pending', async () => {
      const h = makeHarness();
      h.db.select.mockReturnValueOnce(chainable([depositRow()]));
      h.paymentService.verifyDeposit.mockResolvedValue({ status: 'pending', amountMinorUnits: 5_000n, currency: 'USD' });

      const { deposit, wasAlreadyResolved } = await h.service.verifyAndCompleteDeposit('ref-1');
      expect(deposit.status).toBe('pending');
      expect(wasAlreadyResolved).toBe(false);
      expect(h.transactionService.deposit).not.toHaveBeenCalled();
    });
  });

  describe('verifyAndCompleteDeposit — unrecognized reference', () => {
    it('throws NotFoundException rather than silently ignoring it', async () => {
      const h = makeHarness();
      h.db.select.mockReturnValueOnce(chainable([]));
      await expect(h.service.verifyAndCompleteDeposit('unknown-ref')).rejects.toThrow(NotFoundException);
    });
  });

  describe('resolveManually', () => {
    it('completes a stuck pending deposit and attributes the action to the admin', async () => {
      const h = makeHarness();
      h.db.select.mockReturnValueOnce(chainable([depositRow()])); // getById
      h.tx.update
        .mockReturnValueOnce(updateReturning([depositRow({ status: 'completed' })]))
        .mockReturnValueOnce(updateReturning([depositRow({ status: 'completed', transactionId: 'txn-1' })]));

      const result = await h.service.resolveManually('dep-1', 'completed', 'admin-1', 'confirmed with provider dashboard');

      expect(result.status).toBe('completed');
      expect(h.transactionService.deposit).toHaveBeenCalledWith(expect.objectContaining({ actorType: 'admin', actorUserId: 'admin-1' }), h.tx);
      expect(h.auditLog.record).toHaveBeenCalledWith(expect.objectContaining({ actorUserId: 'admin-1', action: 'deposit.manually_resolved' }));
    });

    it('refuses to manually resolve a deposit that is not pending', async () => {
      const h = makeHarness();
      h.db.select.mockReturnValueOnce(chainable([depositRow({ status: 'completed' })]));
      await expect(h.service.resolveManually('dep-1', 'failed', 'admin-1', 'n/a')).rejects.toThrow(ConflictException);
    });
  });

  describe('expireStaleDeposits', () => {
    it('marks overdue pending deposits as expired and returns the count', async () => {
      const h = makeHarness();
      h.db.update.mockReturnValueOnce(updateReturning([depositRow({ id: 'dep-1', status: 'expired' }), depositRow({ id: 'dep-2', status: 'expired' })]));
      const count = await h.service.expireStaleDeposits();
      expect(count).toBe(2);
    });
  });
});
