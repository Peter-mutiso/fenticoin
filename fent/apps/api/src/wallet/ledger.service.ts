import { Injectable } from '@nestjs/common';
import { asc, eq, inArray } from 'drizzle-orm';

import type { DrizzleDb } from '../database/database.types';
import { type LedgerAccount, ledgerAccounts, ledgerEntries } from '../database/schema';
import { InsufficientFundsError, UnbalancedLedgerEntriesError } from './errors';

export interface LedgerEntryInput {
  ledgerAccountId: string;
  direction: 'debit' | 'credit';
  amount: bigint;
}

/**
 * Which direction *increases* a given account's balance. `house_cash` (an
 * asset — real custodied money) and `house_liability` (an expense-style
 * running total of what the house has paid out beyond user stakes) both
 * increase on debit. Everything else here — user wallet accounts (they're
 * a liability: money the house owes the user) and `house_revenue` — is
 * the opposite, increasing on credit. See the transaction-type
 * derivations in `TransactionService` for why each transaction type's
 * entries are shaped the way they are under this convention.
 */
function debitIncreasesBalance(account: Pick<LedgerAccount, 'systemKey'>): boolean {
  return account.systemKey === 'house_cash' || account.systemKey === 'house_liability';
}

function signedDelta(account: Pick<LedgerAccount, 'systemKey'>, direction: 'debit' | 'credit', amount: bigint): bigint {
  const increases = (direction === 'debit') === debitIncreasesBalance(account);
  return increases ? amount : -amount;
}

/**
 * The only code in the system that ever writes `ledger_entries` or
 * mutates `ledger_accounts.balance`. Always called from inside an
 * existing DB transaction (`tx`) owned by the caller — this service has
 * no opinion on idempotency, transaction-row bookkeeping, or what
 * transaction TYPE is being posted; it only knows how to post a balanced
 * set of entries safely under concurrency.
 */
@Injectable()
export class LedgerService {
  async postEntries(
    tx: DrizzleDb,
    transactionId: string,
    currency: string,
    entries: LedgerEntryInput[],
  ): Promise<void> {
    if (entries.length === 0) {
      throw new Error('postEntries called with no entries');
    }
    if (entries.some((e) => e.amount <= 0n)) {
      throw new Error('All ledger entry amounts must be positive');
    }

    const totalDebits = entries.filter((e) => e.direction === 'debit').reduce((sum, e) => sum + e.amount, 0n);
    const totalCredits = entries.filter((e) => e.direction === 'credit').reduce((sum, e) => sum + e.amount, 0n);
    if (totalDebits !== totalCredits) {
      throw new UnbalancedLedgerEntriesError(currency, totalDebits, totalCredits);
    }

    const accountIds = [...new Set(entries.map((e) => e.ledgerAccountId))].sort();

    // Lock every touched account in a globally-consistent (sorted) order —
    // this is what prevents deadlocks between two concurrent transactions
    // that both touch overlapping sets of accounts in different orders.
    const lockedAccounts = await tx
      .select()
      .from(ledgerAccounts)
      .where(inArray(ledgerAccounts.id, accountIds))
      .orderBy(asc(ledgerAccounts.id))
      .for('update');

    if (lockedAccounts.length !== accountIds.length) {
      throw new Error('One or more ledger accounts referenced by these entries do not exist');
    }

    const accountsById = new Map(lockedAccounts.map((a) => [a.id, a]));
    const runningBalance = new Map(lockedAccounts.map((a) => [a.id, a.balance]));

    const entryRows: (typeof ledgerEntries.$inferInsert)[] = [];

    for (const entry of entries) {
      const account = accountsById.get(entry.ledgerAccountId);
      if (!account) {
        throw new Error(`Ledger account ${entry.ledgerAccountId} not found`);
      }
      if (account.currency !== currency) {
        throw new Error(
          `Ledger account ${account.id} is denominated in ${account.currency}, not ${currency}`,
        );
      }

      const current = runningBalance.get(account.id) ?? 0n;
      const next = current + signedDelta(account, entry.direction, entry.amount);

      if (account.ownerType === 'user' && next < 0n) {
        throw new InsufficientFundsError({ accountId: account.id, requested: entry.amount, available: current });
      }

      runningBalance.set(account.id, next);
      entryRows.push({
        transactionId,
        ledgerAccountId: account.id,
        direction: entry.direction,
        amount: entry.amount,
        currency,
        balanceAfter: next,
      });
    }

    await tx.insert(ledgerEntries).values(entryRows);

    for (const [accountId, finalBalance] of runningBalance) {
      await tx
        .update(ledgerAccounts)
        .set({ balance: finalBalance, updatedAt: new Date() })
        .where(eq(ledgerAccounts.id, accountId));
    }
  }
}
