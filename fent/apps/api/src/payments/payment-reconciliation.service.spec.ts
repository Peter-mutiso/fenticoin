import type { Deposit, Withdrawal } from '../database/schema';
import type { DrizzleDb } from '../database/database.types';
import { chainable } from '../test-utils/mock-drizzle';
import type { DepositService } from './deposit.service';
import { PaymentReconciliationService } from './payment-reconciliation.service';
import type { WithdrawalService } from './withdrawal.service';

function makeHarness() {
  const db = { select: jest.fn() };
  const depositService = { verifyAndCompleteDeposit: jest.fn() };
  const withdrawalService = { verifyAndSettleWithdrawal: jest.fn() };

  const service = new PaymentReconciliationService(
    db as unknown as DrizzleDb,
    depositService as unknown as DepositService,
    withdrawalService as unknown as WithdrawalService,
  );

  return { service, db, depositService, withdrawalService };
}

describe('PaymentReconciliationService', () => {
  describe('reconcilePendingDeposits', () => {
    it('re-verifies every pending deposit and counts what changed', async () => {
      const h = makeHarness();
      h.db.select.mockReturnValue(
        chainable([
          { id: 'dep-1', providerName: 'TestProvider', providerReference: 'ref-1' },
          { id: 'dep-2', providerName: 'TestProvider', providerReference: 'ref-2' },
          { id: 'dep-3', providerName: 'TestProvider', providerReference: 'ref-3' },
        ]),
      );
      h.depositService.verifyAndCompleteDeposit
        .mockResolvedValueOnce({ deposit: { id: 'dep-1', status: 'completed' } as Deposit, wasAlreadyResolved: false }) // resolved — a missed webhook caught
        .mockResolvedValueOnce({ deposit: { id: 'dep-2', status: 'pending' } as Deposit, wasAlreadyResolved: false }) // genuinely still pending
        .mockRejectedValueOnce(new Error('provider timeout')); // errored

      const summary = await h.service.reconcilePendingDeposits();

      expect(summary).toEqual({ checked: 3, resolved: 1, stillPending: 1, errors: 1 });
    });

    it('does not double-count a deposit that another process already resolved between the query and now', async () => {
      const h = makeHarness();
      h.db.select.mockReturnValue(chainable([{ id: 'dep-1', providerName: 'TestProvider', providerReference: 'ref-1' }]));
      h.depositService.verifyAndCompleteDeposit.mockResolvedValue({ deposit: { id: 'dep-1', status: 'completed' } as Deposit, wasAlreadyResolved: true });

      const summary = await h.service.reconcilePendingDeposits();
      expect(summary).toEqual({ checked: 1, resolved: 0, stillPending: 0, errors: 0 });
    });
  });

  describe('reconcilePendingWithdrawals', () => {
    it('re-verifies every submitted withdrawal and counts what changed', async () => {
      const h = makeHarness();
      h.db.select.mockReturnValue(chainable([{ id: 'wd-1', providerName: 'TestProvider', providerReference: 'wref-1' }]));
      h.withdrawalService.verifyAndSettleWithdrawal.mockResolvedValue({ withdrawal: { id: 'wd-1', status: 'completed' } as Withdrawal, wasAlreadyResolved: false });

      const summary = await h.service.reconcilePendingWithdrawals();
      expect(summary).toEqual({ checked: 1, resolved: 1, stillPending: 0, errors: 0 });
    });
  });
});
