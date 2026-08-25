import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import {
  houseSystemAccountKeyEnum,
  ledgerAccountKindEnum,
  ledgerAccountOwnerTypeEnum,
  ledgerDirectionEnum,
  transactionActorTypeEnum,
  transactionStatusEnum,
  transactionTypeEnum,
} from './enums';
import { users } from './users';

/**
 * The user-facing container: one row per (user, currency). Holds no
 * balance itself — balances live on the two `ledger_accounts` rows this
 * wallet owns (`available` and `locked`); see that table's comment for why.
 */
export const wallets = pgTable(
  'wallets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    currency: varchar('currency', { length: 3 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('wallets_user_id_currency_idx').on(table.userId, table.currency)],
);

export type Wallet = typeof wallets.$inferSelect;
export type NewWallet = typeof wallets.$inferInsert;

/**
 * The actual double-entry accounts. A user's wallet is backed by exactly
 * two: `available` (spendable/withdrawable) and `locked` (committed to an
 * open bet). Placing a bet is a transfer between a user's own two
 * accounts — no house account involved, since the house's total
 * obligation to the user hasn't changed, only how much of it is
 * currently free. `system` accounts are the house's own books (see
 * `houseSystemAccountKeyEnum`) and are never owned by a wallet.
 *
 * `balance` is the materialized, authoritative-for-reads cache — always
 * written in the same DB transaction as the `ledger_entries` that justify
 * it (see `LedgerService.postTransaction`), and periodically verified
 * against the entries themselves by `ReconciliationService`.
 */
export const ledgerAccounts = pgTable(
  'ledger_accounts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    walletId: uuid('wallet_id').references(() => wallets.id, { onDelete: 'restrict' }),
    ownerType: ledgerAccountOwnerTypeEnum('owner_type').notNull(),
    kind: ledgerAccountKindEnum('kind').notNull(),
    systemKey: houseSystemAccountKeyEnum('system_key'),
    currency: varchar('currency', { length: 3 }).notNull(),
    // A raw SQL default (not a literal `0n`) — drizzle-kit's snapshot diffing
    // JSON.stringifies the schema internally, which throws on a real BigInt.
    balance: bigint('balance', { mode: 'bigint' }).notNull().default(sql`0`),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('ledger_accounts_wallet_kind_idx')
      .on(table.walletId, table.kind)
      .where(sql`${table.walletId} IS NOT NULL`),
    uniqueIndex('ledger_accounts_system_key_currency_idx')
      .on(table.systemKey, table.currency)
      .where(sql`${table.systemKey} IS NOT NULL`),
    index('ledger_accounts_currency_idx').on(table.currency),
    check(
      'ledger_accounts_owner_shape',
      sql`(${table.ownerType} = 'user' AND ${table.walletId} IS NOT NULL AND ${table.kind} IN ('available', 'locked') AND ${table.systemKey} IS NULL)
        OR (${table.ownerType} = 'system' AND ${table.walletId} IS NULL AND ${table.kind} = 'system' AND ${table.systemKey} IS NOT NULL)`,
    ),
    // User-owned accounts can never go negative. House accounts are a P&L
    // construct and are allowed to carry either sign.
    check(
      'ledger_accounts_user_balance_non_negative',
      sql`${table.ownerType} != 'user' OR ${table.balance} >= 0`,
    ),
  ],
);

export type LedgerAccount = typeof ledgerAccounts.$inferSelect;
export type NewLedgerAccount = typeof ledgerAccounts.$inferInsert;

/**
 * One row per financial event. `idempotencyKey`, when the caller supplies
 * one, makes retries safe: a second request with the same key returns the
 * original result instead of re-executing the mutation (see
 * `TransactionService.withIdempotency`). `subjectUserId` is whose wallet
 * this affects; `actorUserId` is who *caused* it — they differ for admin
 * adjustments (actor = admin, subject = the user being adjusted) and
 * system-driven events (actor is null, actorType = 'system').
 *
 * Immutability: rows here are never updated except `status` (e.g.
 * posted -> reversed) — the financial history itself is the associated
 * `ledger_entries`, which are never updated or deleted, ever.
 */
export const transactions = pgTable(
  'transactions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    idempotencyKey: varchar('idempotency_key', { length: 128 }),
    type: transactionTypeEnum('type').notNull(),
    status: transactionStatusEnum('status').notNull().default('posted'),
    currency: varchar('currency', { length: 3 }).notNull(),
    totalAmount: bigint('total_amount', { mode: 'bigint' }).notNull(),
    actorType: transactionActorTypeEnum('actor_type').notNull(),
    actorUserId: uuid('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
    subjectUserId: uuid('subject_user_id').references(() => users.id, { onDelete: 'set null' }),
    reason: text('reason'),
    relatedType: varchar('related_type', { length: 30 }),
    relatedId: varchar('related_id', { length: 64 }),
    reversalOfTransactionId: uuid('reversal_of_transaction_id'),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    postedAt: timestamp('posted_at', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('transactions_idempotency_key_idx')
      .on(table.idempotencyKey)
      .where(sql`${table.idempotencyKey} IS NOT NULL`),
    index('transactions_subject_user_id_idx').on(table.subjectUserId, table.createdAt),
    index('transactions_type_idx').on(table.type),
    index('transactions_related_idx').on(table.relatedType, table.relatedId),
    check('transactions_total_amount_non_negative', sql`${table.totalAmount} >= 0`),
  ],
);

export type Transaction = typeof transactions.$inferSelect;
export type NewTransaction = typeof transactions.$inferInsert;

/**
 * The immutable double-entry postings. `LedgerService` is the only code
 * that ever inserts here, and it always inserts a balanced set (debits ==
 * credits, per currency) for a given `transactionId` in one DB
 * transaction. `balanceAfter` is a point-in-time snapshot of the owning
 * account's balance immediately after this posting — an audit trail
 * independent of the mutable `ledger_accounts.balance` cache.
 */
export const ledgerEntries = pgTable(
  'ledger_entries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    transactionId: uuid('transaction_id')
      .notNull()
      .references(() => transactions.id, { onDelete: 'restrict' }),
    ledgerAccountId: uuid('ledger_account_id')
      .notNull()
      .references(() => ledgerAccounts.id, { onDelete: 'restrict' }),
    direction: ledgerDirectionEnum('direction').notNull(),
    amount: bigint('amount', { mode: 'bigint' }).notNull(),
    currency: varchar('currency', { length: 3 }).notNull(),
    balanceAfter: bigint('balance_after', { mode: 'bigint' }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('ledger_entries_transaction_id_idx').on(table.transactionId),
    index('ledger_entries_ledger_account_id_idx').on(table.ledgerAccountId, table.createdAt),
    check('ledger_entries_amount_positive', sql`${table.amount} > 0`),
  ],
);

export type LedgerEntry = typeof ledgerEntries.$inferSelect;
export type NewLedgerEntry = typeof ledgerEntries.$inferInsert;

/**
 * A history of reconciliation runs (`ReconciliationService`), each
 * comparing one ledger account's cached `balance` against the sum of its
 * `ledger_entries`. `driftAmount` should always be `0` — a non-zero value
 * means the cache and the entries have disagreed, which is a bug, not an
 * expected occurrence.
 */
export const balanceSnapshots = pgTable(
  'balance_snapshots',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ledgerAccountId: uuid('ledger_account_id')
      .notNull()
      .references(() => ledgerAccounts.id, { onDelete: 'cascade' }),
    cachedBalance: bigint('cached_balance', { mode: 'bigint' }).notNull(),
    computedBalance: bigint('computed_balance', { mode: 'bigint' }).notNull(),
    driftAmount: bigint('drift_amount', { mode: 'bigint' }).notNull(),
    isDrifted: boolean('is_drifted').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('balance_snapshots_ledger_account_id_idx').on(table.ledgerAccountId, table.createdAt)],
);

export type BalanceSnapshot = typeof balanceSnapshots.$inferSelect;
export type NewBalanceSnapshot = typeof balanceSnapshots.$inferInsert;
