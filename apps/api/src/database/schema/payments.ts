import { sql } from 'drizzle-orm';
import { bigint, boolean, check, index, jsonb, pgTable, text, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';

import { depositStatusEnum, paymentWebhookOutcomeEnum, withdrawalStatusEnum } from './enums';
import { transactions } from './wallet';
import { users } from './users';

/**
 * One deposit attempt. No ledger movement happens until `status` reaches
 * `completed` — `transactionId` is only ever set at that point, by the
 * same DB transaction that flips the status (see
 * `payments/deposit.service.ts`). `providerReference` is how an inbound
 * webhook finds its way back to this row; the (provider, reference) pair
 * is unique so two different deposits can never claim the same
 * provider-side transaction.
 */
export const deposits = pgTable(
  'deposits',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    currency: varchar('currency', { length: 3 }).notNull(),
    amount: bigint('amount', { mode: 'bigint' }).notNull(),
    status: depositStatusEnum('status').notNull().default('pending'),
    providerName: varchar('provider_name', { length: 64 }).notNull(),
    providerReference: varchar('provider_reference', { length: 128 }),
    redirectUrl: text('redirect_url'),
    transactionId: uuid('transaction_id').references(() => transactions.id, { onDelete: 'restrict' }),
    failureReason: text('failure_reason'),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    idempotencyKey: varchar('idempotency_key', { length: 128 }),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('deposits_idempotency_key_idx').on(table.idempotencyKey).where(sql`${table.idempotencyKey} IS NOT NULL`),
    uniqueIndex('deposits_provider_reference_idx')
      .on(table.providerName, table.providerReference)
      .where(sql`${table.providerReference} IS NOT NULL`),
    index('deposits_user_id_created_at_idx').on(table.userId, table.createdAt),
    // What the expiry scheduler polls: "which pending deposits are overdue".
    index('deposits_status_expires_at_idx').on(table.status, table.expiresAt),
    check('deposits_amount_positive', sql`${table.amount} > 0`),
  ],
);

export type Deposit = typeof deposits.$inferSelect;
export type NewDeposit = typeof deposits.$inferInsert;

/**
 * One withdrawal request. `holdTransactionId` is set atomically with the
 * row itself (funds move available -> locked at request time, before any
 * review happens) — see `payments/withdrawal.service.ts`. Exactly one of
 * `releaseTransactionId` / `settlementTransactionId` gets set once the
 * request reaches a terminal outcome; `reversalTransactionId` only if an
 * already-completed withdrawal is later reversed.
 */
export const withdrawals = pgTable(
  'withdrawals',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    currency: varchar('currency', { length: 3 }).notNull(),
    amount: bigint('amount', { mode: 'bigint' }).notNull(),
    status: withdrawalStatusEnum('status').notNull().default('pending_review'),
    providerName: varchar('provider_name', { length: 64 }),
    providerReference: varchar('provider_reference', { length: 128 }),
    holdTransactionId: uuid('hold_transaction_id')
      .notNull()
      .references(() => transactions.id, { onDelete: 'restrict' }),
    releaseTransactionId: uuid('release_transaction_id').references(() => transactions.id, { onDelete: 'restrict' }),
    settlementTransactionId: uuid('settlement_transaction_id').references(() => transactions.id, { onDelete: 'restrict' }),
    reversalTransactionId: uuid('reversal_transaction_id').references(() => transactions.id, { onDelete: 'restrict' }),
    reviewedByUserId: uuid('reviewed_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    rejectionReason: text('rejection_reason'),
    failureReason: text('failure_reason'),
    idempotencyKey: varchar('idempotency_key', { length: 128 }),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('withdrawals_idempotency_key_idx').on(table.idempotencyKey).where(sql`${table.idempotencyKey} IS NOT NULL`),
    uniqueIndex('withdrawals_provider_reference_idx')
      .on(table.providerName, table.providerReference)
      .where(sql`${table.providerReference} IS NOT NULL`),
    index('withdrawals_user_id_created_at_idx').on(table.userId, table.createdAt),
    index('withdrawals_status_idx').on(table.status),
    check('withdrawals_amount_positive', sql`${table.amount} > 0`),
  ],
);

export type Withdrawal = typeof withdrawals.$inferSelect;
export type NewWithdrawal = typeof withdrawals.$inferInsert;

/**
 * An append-only record of every inbound webhook delivery attempt —
 * including duplicates and retries — independent of whatever the
 * delivery caused (or didn't cause) to happen to a deposit/withdrawal.
 * This is what "investigating failed transactions" and duplicate-callback
 * handling actually rest on: the deposit/withdrawal row only ever shows
 * current state, this table shows the full history of attempts.
 */
export const paymentWebhookReceipts = pgTable(
  'payment_webhook_receipts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    providerName: varchar('provider_name', { length: 64 }).notNull(),
    providerReference: varchar('provider_reference', { length: 128 }),
    kind: varchar('kind', { length: 32 }),
    // sha256 hex of the raw request body — lets an exact-duplicate delivery
    // be recognized even before the payload is parsed.
    rawBodyHash: varchar('raw_body_hash', { length: 64 }).notNull(),
    signatureValid: boolean('signature_valid').notNull(),
    outcome: paymentWebhookOutcomeEnum('outcome').notNull(),
    relatedDepositId: uuid('related_deposit_id').references(() => deposits.id, { onDelete: 'set null' }),
    relatedWithdrawalId: uuid('related_withdrawal_id').references(() => withdrawals.id, { onDelete: 'set null' }),
    errorMessage: text('error_message'),
    receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('payment_webhook_receipts_provider_reference_idx').on(table.providerName, table.providerReference),
    index('payment_webhook_receipts_received_at_idx').on(table.receivedAt),
  ],
);

export type PaymentWebhookReceipt = typeof paymentWebhookReceipts.$inferSelect;
export type NewPaymentWebhookReceipt = typeof paymentWebhookReceipts.$inferInsert;
