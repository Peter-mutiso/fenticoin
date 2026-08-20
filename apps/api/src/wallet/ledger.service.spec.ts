import type { DrizzleDb } from '../database/database.types';
import { chainable } from '../test-utils/mock-drizzle';
import { InsufficientFundsError, UnbalancedLedgerEntriesError } from './errors';
import { LedgerService } from './ledger.service';

function userAccount(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'user-available',
    walletId: 'wallet-1',
    ownerType: 'user',
    kind: 'available',
    systemKey: null,
    currency: 'USD',
    balance: 1000n,
    ...overrides,
  };
}

function houseCashAccount(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'house-cash',
    walletId: null,
    ownerType: 'system',
    kind: 'system',
    systemKey: 'house_cash',
    currency: 'USD',
    balance: 500_000n,
    ...overrides,
  };
}

function houseRevenueAccount(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'house-revenue',
    walletId: null,
    ownerType: 'system',
    kind: 'system',
    systemKey: 'house_revenue',
    currency: 'USD',
    balance: 0n,
    ...overrides,
  };
}

function makeDb(lockedAccounts: unknown[]) {
  const selectChain = chainable(lockedAccounts);
  const insertChain = chainable(undefined);
  const insert = jest.fn().mockReturnValue(insertChain);
  const update = jest.fn().mockReturnValue(chainable(undefined));
  const select = jest.fn().mockReturnValue(selectChain);
  return { db: { select, insert, update } as unknown as DrizzleDb, insert, insertChain, update, selectChain };
}

describe('LedgerService', () => {
  const service = new LedgerService();

  it('rejects an empty entry set', async () => {
    const { db } = makeDb([]);
    await expect(service.postEntries(db, 'tx-1', 'USD', [])).rejects.toThrow('no entries');
  });

  it('rejects entries that do not balance (debits != credits)', async () => {
    const { db } = makeDb([userAccount(), houseCashAccount()]);
    await expect(
      service.postEntries(db, 'tx-1', 'USD', [
        { ledgerAccountId: 'house-cash', direction: 'debit', amount: 100n },
        { ledgerAccountId: 'user-available', direction: 'credit', amount: 99n },
      ]),
    ).rejects.toThrow(UnbalancedLedgerEntriesError);
  });

  it('posts a deposit: debit house_cash (asset, increases on debit), credit wallet available (increases on credit)', async () => {
    const { db, insertChain, update } = makeDb([
      userAccount({ balance: 1000n }),
      houseCashAccount({ balance: 500_000n }),
    ]);

    await service.postEntries(db, 'tx-1', 'USD', [
      { ledgerAccountId: 'house-cash', direction: 'debit', amount: 100n },
      { ledgerAccountId: 'user-available', direction: 'credit', amount: 100n },
    ]);

    expect(insertChain.values).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ ledgerAccountId: 'house-cash', amount: 100n, balanceAfter: 500_100n }),
        expect.objectContaining({ ledgerAccountId: 'user-available', amount: 100n, balanceAfter: 1100n }),
      ]),
    );
    expect(update).toHaveBeenCalledTimes(2);
  });

  it('posts a withdrawal: debit wallet available (decreases), credit house_cash (decreases)', async () => {
    const { db } = makeDb([userAccount({ balance: 1000n }), houseCashAccount({ balance: 500_000n })]);

    await expect(
      service.postEntries(db, 'tx-1', 'USD', [
        { ledgerAccountId: 'user-available', direction: 'debit', amount: 400n },
        { ledgerAccountId: 'house-cash', direction: 'credit', amount: 400n },
      ]),
    ).resolves.toBeUndefined();
  });

  it('throws InsufficientFundsError instead of allowing a user account to go negative', async () => {
    const { db, update } = makeDb([userAccount({ balance: 100n }), houseCashAccount()]);

    await expect(
      service.postEntries(db, 'tx-1', 'USD', [
        { ledgerAccountId: 'user-available', direction: 'debit', amount: 500n },
        { ledgerAccountId: 'house-cash', direction: 'credit', amount: 500n },
      ]),
    ).rejects.toThrow(InsufficientFundsError);

    // No balance mutation should be attempted once the check fails.
    expect(update).not.toHaveBeenCalled();
  });

  it('allows a system (house) account to go negative — it is a P&L construct, not a spendable balance', async () => {
    const { db, update } = makeDb([userAccount({ balance: 1000n }), houseRevenueAccount({ balance: 0n })]);

    // A balanced transfer that debits house_revenue (which decreases on
    // debit) below zero — e.g. what a reversal of an earlier bet-loss
    // credit would look like. Must succeed: only user accounts are
    // guarded against going negative.
    await expect(
      service.postEntries(db, 'tx-1', 'USD', [
        { ledgerAccountId: 'house-revenue', direction: 'debit', amount: 50n },
        { ledgerAccountId: 'user-available', direction: 'credit', amount: 50n },
      ]),
    ).resolves.toBeUndefined();

    expect(update).toHaveBeenCalledTimes(2);
  });

  it('rejects entries referencing an account of a different currency', async () => {
    const { db } = makeDb([userAccount({ currency: 'EUR' }), houseCashAccount()]);

    await expect(
      service.postEntries(db, 'tx-1', 'USD', [
        { ledgerAccountId: 'user-available', direction: 'credit', amount: 100n },
        { ledgerAccountId: 'house-cash', direction: 'debit', amount: 100n },
      ]),
    ).rejects.toThrow(/denominated in/);
  });

  it('rejects a non-positive entry amount', async () => {
    const { db } = makeDb([userAccount(), houseCashAccount()]);
    await expect(
      service.postEntries(db, 'tx-1', 'USD', [
        { ledgerAccountId: 'user-available', direction: 'credit', amount: 0n },
        { ledgerAccountId: 'house-cash', direction: 'debit', amount: 0n },
      ]),
    ).rejects.toThrow('positive');
  });

  it('rejects when a referenced ledger account does not exist', async () => {
    const { db } = makeDb([userAccount()]); // house-cash missing from the "locked" result set
    await expect(
      service.postEntries(db, 'tx-1', 'USD', [
        { ledgerAccountId: 'user-available', direction: 'credit', amount: 100n },
        { ledgerAccountId: 'house-cash', direction: 'debit', amount: 100n },
      ]),
    ).rejects.toThrow('do not exist');
  });
});
