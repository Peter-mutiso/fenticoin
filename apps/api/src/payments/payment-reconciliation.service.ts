import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, eq, isNotNull } from 'drizzle-orm';

import { DRIZZLE_CLIENT } from '../database/database.constants';
import type { DrizzleDb } from '../database/database.types';
import { deposits, withdrawals } from '../database/schema';
import { DepositService } from './deposit.service';
import { WithdrawalService } from './withdrawal.service';

export interface PaymentReconciliationSummary {
  checked: number;
  resolved: number;
  stillPending: number;
  errors: number;
}

/**
 * Distinct from `wallet/reconciliation.service.ts`'s `ReconciliationService`
 * (which checks our *own* ledger cache against our *own* ledger entries):
 * this reconciles our payment records against the *provider's* independent
 * view of the world. Its job is to catch a missed or lost webhook — a
 * deposit the provider completed minutes ago that we never heard about —
 * by re-running the exact same trusted verification path a webhook would
 * have triggered. Safe to run as often as needed: every check goes
 * through the same idempotent, atomic completion logic as a real webhook.
 */
@Injectable()
export class PaymentReconciliationService {
  private readonly logger = new Logger(PaymentReconciliationService.name);

  constructor(
    @Inject(DRIZZLE_CLIENT) private readonly db: DrizzleDb,
    private readonly depositService: DepositService,
    private readonly withdrawalService: WithdrawalService,
  ) {}

  async reconcilePendingDeposits(): Promise<PaymentReconciliationSummary> {
    const pending = await this.db
      .select({ id: deposits.id, providerName: deposits.providerName, providerReference: deposits.providerReference })
      .from(deposits)
      .where(and(eq(deposits.status, 'pending'), isNotNull(deposits.providerReference)));

    const summary: PaymentReconciliationSummary = { checked: 0, resolved: 0, stillPending: 0, errors: 0 };

    for (const row of pending) {
      if (!row.providerReference) continue;
      summary.checked += 1;
      try {
        const { deposit, wasAlreadyResolved } = await this.depositService.verifyAndCompleteDeposit(row.providerReference);
        if (wasAlreadyResolved) continue; // resolved by something else between the query and now
        if (deposit.status === 'pending') {
          summary.stillPending += 1;
        } else {
          summary.resolved += 1;
          this.logger.warn(`Reconciliation resolved deposit ${deposit.id} (was pending, provider now reports ${deposit.status}) — a webhook was likely missed`);
        }
      } catch (error) {
        summary.errors += 1;
        this.logger.error(`Reconciliation failed for deposit ${row.id}: ${String(error)}`);
      }
    }

    return summary;
  }

  async reconcilePendingWithdrawals(): Promise<PaymentReconciliationSummary> {
    const submitted = await this.db
      .select({ id: withdrawals.id, providerName: withdrawals.providerName, providerReference: withdrawals.providerReference })
      .from(withdrawals)
      .where(and(eq(withdrawals.status, 'submitted'), isNotNull(withdrawals.providerReference)));

    const summary: PaymentReconciliationSummary = { checked: 0, resolved: 0, stillPending: 0, errors: 0 };

    for (const row of submitted) {
      if (!row.providerReference) continue;
      summary.checked += 1;
      try {
        const { withdrawal, wasAlreadyResolved } = await this.withdrawalService.verifyAndSettleWithdrawal(row.providerReference);
        if (wasAlreadyResolved) continue;
        if (withdrawal.status === 'submitted') {
          summary.stillPending += 1;
        } else {
          summary.resolved += 1;
          this.logger.warn(`Reconciliation resolved withdrawal ${withdrawal.id} (was submitted, provider now reports ${withdrawal.status}) — a webhook was likely missed`);
        }
      } catch (error) {
        summary.errors += 1;
        this.logger.error(`Reconciliation failed for withdrawal ${row.id}: ${String(error)}`);
      }
    }

    return summary;
  }
}
