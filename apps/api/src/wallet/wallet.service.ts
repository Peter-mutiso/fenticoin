import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { Money } from '@fenticoin/domain';

import { DRIZZLE_CLIENT } from '../database/database.constants';
import type { DrizzleDb } from '../database/database.types';
import { type LedgerAccount, ledgerAccounts, type Wallet, wallets } from '../database/schema';
import { requireCurrency, type HouseSystemAccountKey } from './wallet.constants';

export interface WalletAccounts {
  wallet: Wallet;
  available: LedgerAccount;
  locked: LedgerAccount;
}

export interface WalletBalance {
  currency: string;
  available: Money;
  locked: Money;
}

@Injectable()
export class WalletService {
  constructor(@Inject(DRIZZLE_CLIENT) private readonly db: DrizzleDb) {}

  /**
   * Fetches (or lazily provisions) a user's wallet and its two ledger
   * accounts. Safe to call with either the module-level `db` (read paths)
   * or a transaction-scoped `tx` (write paths that need the accounts to
   * exist before posting entries against them).
   */
  async getOrCreateWalletAccounts(db: DrizzleDb, userId: string, currencyCode: string): Promise<WalletAccounts> {
    requireCurrency(currencyCode);

    const wallet = await this.getOrCreateWallet(db, userId, currencyCode);
    const available = await this.getOrCreateUserLedgerAccount(db, wallet, 'available');
    const locked = await this.getOrCreateUserLedgerAccount(db, wallet, 'locked');

    return { wallet, available, locked };
  }

  async getBalance(userId: string, currencyCode: string): Promise<WalletBalance> {
    const currency = requireCurrency(currencyCode);
    const { available, locked } = await this.getOrCreateWalletAccounts(this.db, userId, currencyCode);

    return {
      currency: currencyCode,
      available: Money.fromMinorUnits(available.balance, currency),
      locked: Money.fromMinorUnits(locked.balance, currency),
    };
  }

  async listWallets(userId: string): Promise<Wallet[]> {
    return this.db.select().from(wallets).where(eq(wallets.userId, userId));
  }

  async getSystemAccount(db: DrizzleDb, systemKey: HouseSystemAccountKey, currencyCode: string): Promise<LedgerAccount> {
    const [account] = await db
      .select()
      .from(ledgerAccounts)
      .where(and(eq(ledgerAccounts.systemKey, systemKey), eq(ledgerAccounts.currency, currencyCode)))
      .limit(1);

    if (!account) {
      throw new NotFoundException(
        `System ledger account "${systemKey}" for ${currencyCode} has not been provisioned — run the wallet seed script`,
      );
    }
    return account;
  }

  private async getOrCreateWallet(db: DrizzleDb, userId: string, currency: string): Promise<Wallet> {
    const [existing] = await db
      .select()
      .from(wallets)
      .where(and(eq(wallets.userId, userId), eq(wallets.currency, currency)))
      .limit(1);
    if (existing) return existing;

    const [created] = await db.insert(wallets).values({ userId, currency }).onConflictDoNothing().returning();
    if (created) return created;

    // Lost a creation race to a concurrent request — the row now exists.
    const [wallet] = await db
      .select()
      .from(wallets)
      .where(and(eq(wallets.userId, userId), eq(wallets.currency, currency)))
      .limit(1);
    if (!wallet) throw new Error(`Failed to provision wallet for user ${userId} in ${currency}`);
    return wallet;
  }

  private async getOrCreateUserLedgerAccount(
    db: DrizzleDb,
    wallet: Wallet,
    kind: 'available' | 'locked',
  ): Promise<LedgerAccount> {
    const [existing] = await db
      .select()
      .from(ledgerAccounts)
      .where(and(eq(ledgerAccounts.walletId, wallet.id), eq(ledgerAccounts.kind, kind)))
      .limit(1);
    if (existing) return existing;

    const [created] = await db
      .insert(ledgerAccounts)
      .values({ walletId: wallet.id, ownerType: 'user', kind, currency: wallet.currency })
      .onConflictDoNothing()
      .returning();
    if (created) return created;

    const [account] = await db
      .select()
      .from(ledgerAccounts)
      .where(and(eq(ledgerAccounts.walletId, wallet.id), eq(ledgerAccounts.kind, kind)))
      .limit(1);
    if (!account) throw new Error(`Failed to provision ${kind} ledger account for wallet ${wallet.id}`);
    return account;
  }
}
