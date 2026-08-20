import { Inject, Injectable, Logger } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';

import { DRIZZLE_CLIENT } from '../database/database.constants';
import type { DrizzleDb } from '../database/database.types';
import { balanceSnapshots, ledgerAccounts, ledgerEntries } from '../database/schema';

export interface ReconciliationResult {
  ledgerAccountId: string;
  cachedBalance: bigint;
  computedBalance: bigint;
  driftAmount: bigint;
  isDrifted: boolean;
}

/**
 * Verifies that `ledger_accounts.balance` (the fast-read cache) still
 * agrees with what the immutable `ledger_entries` actually sum to. Drift
 * should never happen — if it does, it means a bug wrote to one without
 * the other, and this is the safety net that catches it. Every run is
 * recorded to `balance_snapshots` so drift history is itself auditable.
 */
@Injectable()
export class ReconciliationService {
  private readonly logger = new Logger(ReconciliationService.name);

  constructor(@Inject(DRIZZLE_CLIENT) private readonly db: DrizzleDb) {}

  async reconcileAccount(ledgerAccountId: string): Promise<ReconciliationResult> {
    const [account] = await this.db.select().from(ledgerAccounts).where(eq(ledgerAccounts.id, ledgerAccountId)).limit(1);
    if (!account) {
      throw new Error(`Ledger account ${ledgerAccountId} not found`);
    }

    const debitIncreases = account.systemKey === 'house_cash' || account.systemKey === 'house_liability';

    const [sums] = await this.db
      .select({
        debitTotal: sql<string>`coalesce(sum(${ledgerEntries.amount}) filter (where ${ledgerEntries.direction} = 'debit'), 0)`,
        creditTotal: sql<string>`coalesce(sum(${ledgerEntries.amount}) filter (where ${ledgerEntries.direction} = 'credit'), 0)`,
      })
      .from(ledgerEntries)
      .where(eq(ledgerEntries.ledgerAccountId, ledgerAccountId));

    const debitTotal = BigInt(sums?.debitTotal ?? 0);
    const creditTotal = BigInt(sums?.creditTotal ?? 0);
    const computedBalance = debitIncreases ? debitTotal - creditTotal : creditTotal - debitTotal;

    const driftAmount = account.balance - computedBalance;
    const isDrifted = driftAmount !== 0n;

    if (isDrifted) {
      this.logger.error(
        `Ledger account ${ledgerAccountId} has drifted: cached=${account.balance} computed=${computedBalance} drift=${driftAmount}`,
      );
    }

    await this.db.insert(balanceSnapshots).values({
      ledgerAccountId,
      cachedBalance: account.balance,
      computedBalance,
      driftAmount,
      isDrifted,
    });

    return { ledgerAccountId, cachedBalance: account.balance, computedBalance, driftAmount, isDrifted };
  }

  async reconcileAll(): Promise<ReconciliationResult[]> {
    const accounts = await this.db.select({ id: ledgerAccounts.id }).from(ledgerAccounts);
    const results: ReconciliationResult[] = [];
    for (const account of accounts) {
      results.push(await this.reconcileAccount(account.id));
    }
    return results;
  }
}
