import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { betResultEnum, betStatusEnum, betTypeEnum, settlementOutcomeEnum } from './enums';
import { instruments } from './markets';
import { users } from './users';
import { transactions } from './wallet';

/**
 * Per-(instrument, bet type) admin-configurable rules the odds engine and
 * placement flow read at request time. Deliberately never referenced by
 * the settlement path — every bet snapshots the rate it was placed under
 * (`bets.payoutRateBasisPoints`), so changing a row here can never alter
 * an already-open bet's payout. That snapshot is *the* mechanism that
 * keeps an admin UI edit from corrupting financial records: it can only
 * ever affect bets placed after the change.
 */
export const bettingConfigs = pgTable(
  'betting_configs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    instrumentId: uuid('instrument_id')
      .notNull()
      .references(() => instruments.id, { onDelete: 'restrict' }),
    betType: betTypeEnum('bet_type').notNull(),
    minStake: bigint('min_stake', { mode: 'bigint' }).notNull(),
    maxStake: bigint('max_stake', { mode: 'bigint' }).notNull(),
    // Profit rate, not total payout multiplier — e.g. 8500 = 85% profit,
    // so a 10.00 stake pays out 18.50 (stake back + 8.50 profit) on a win.
    payoutRateBasisPoints: bigint('payout_rate_basis_points', { mode: 'bigint' }).notNull(),
    // Aggregate open-stake ceiling for this (instrument, betType) — new
    // placements that would push exposure past this are rejected. Null = no limit.
    maxExposure: bigint('max_exposure', { mode: 'bigint' }),
    minDurationSeconds: bigint('min_duration_seconds', { mode: 'bigint' }).notNull(),
    maxDurationSeconds: bigint('max_duration_seconds', { mode: 'bigint' }).notNull(),
    isEnabled: boolean('is_enabled').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('betting_configs_instrument_id_bet_type_idx').on(table.instrumentId, table.betType),
    check('betting_configs_stake_bounds', sql`${table.minStake} > 0 AND ${table.maxStake} >= ${table.minStake}`),
    check('betting_configs_payout_rate_positive', sql`${table.payoutRateBasisPoints} > 0`),
    check(
      'betting_configs_duration_bounds',
      sql`${table.minDurationSeconds} > 0 AND ${table.maxDurationSeconds} >= ${table.minDurationSeconds}`,
    ),
  ],
);

export type BettingConfig = typeof bettingConfigs.$inferSelect;
export type NewBettingConfig = typeof bettingConfigs.$inferInsert;

/**
 * A single bet. Immutable once placed except for the well-defined set of
 * status/result/settlement fields written exactly once each, under a
 * legal-transition guard (`bet-state-machine.ts`) — never a free-form
 * update. `entryPrice`/`settlementPrice` are integers scaled to the
 * instrument's `pricePrecision` (see `markets/price-quote.ts`), and both
 * are snapshotted from `PriceFeedService`'s trusted read path, never
 * client-supplied.
 */
export const bets = pgTable(
  'bets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    instrumentId: uuid('instrument_id')
      .notNull()
      .references(() => instruments.id, { onDelete: 'restrict' }),
    type: betTypeEnum('type').notNull(),
    // 'rise'|'fall' | 'higher'|'lower' | 'up'|'down', depending on `type` —
    // validated by the matching `BetContract`, not by the database.
    selection: varchar('selection', { length: 10 }).notNull(),
    stakeAmount: bigint('stake_amount', { mode: 'bigint' }).notNull(),
    currency: varchar('currency', { length: 3 }).notNull(),
    entryPrice: bigint('entry_price', { mode: 'bigint' }).notNull(),
    entryPriceObservedAt: timestamp('entry_price_observed_at', { withTimezone: true }).notNull(),
    // Which price-feed provider produced the entry tick (e.g. "coingecko",
    // "dev-fixture") — persisted here because by settlement time the
    // original PriceQuote is long gone; the settlement audit trail needs
    // it to record "price-provider information" for the opening price too.
    entryPriceSource: varchar('entry_price_source', { length: 64 }),
    // Only set (and only meaningful) for Higher/Lower.
    targetPrice: bigint('target_price', { mode: 'bigint' }),
    payoutRateBasisPoints: bigint('payout_rate_basis_points', { mode: 'bigint' }).notNull(),
    potentialPayout: bigint('potential_payout', { mode: 'bigint' }).notNull(),
    status: betStatusEnum('status').notNull().default('open'),
    settlementClaimToken: varchar('settlement_claim_token', { length: 64 }),
    result: betResultEnum('result'),
    placedAt: timestamp('placed_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    settlementPrice: bigint('settlement_price', { mode: 'bigint' }),
    settlementPriceObservedAt: timestamp('settlement_price_observed_at', { withTimezone: true }),
    settledAt: timestamp('settled_at', { withTimezone: true }),
    placementTransactionId: uuid('placement_transaction_id').references(() => transactions.id, {
      onDelete: 'restrict',
    }),
    settlementTransactionId: uuid('settlement_transaction_id').references(() => transactions.id, {
      onDelete: 'restrict',
    }),
    idempotencyKey: varchar('idempotency_key', { length: 128 }),
    cancelReason: text('cancel_reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('bets_idempotency_key_idx').on(table.idempotencyKey).where(sql`${table.idempotencyKey} IS NOT NULL`),
    index('bets_user_id_created_at_idx').on(table.userId, table.createdAt),
    index('bets_instrument_id_status_idx').on(table.instrumentId, table.status),
    // What the settlement scheduler polls: "which open bets are due".
    index('bets_status_expires_at_idx').on(table.status, table.expiresAt),
    check('bets_stake_positive', sql`${table.stakeAmount} > 0`),
    check('bets_potential_payout_at_least_stake', sql`${table.potentialPayout} >= ${table.stakeAmount}`),
    check('bets_expires_after_placed', sql`${table.expiresAt} > ${table.placedAt}`),
  ],
);

export type Bet = typeof bets.$inferSelect;
export type NewBet = typeof bets.$inferInsert;

/**
 * The immutable settlement audit trail: one append-only row per
 * settlement *attempt* against a bet — successful or not. This is
 * deliberately a separate table from `bets` rather than more columns on
 * it: `bets` holds current state (and gets overwritten as that state
 * changes), while this table is a forensic record that must never be
 * updated or deleted once written, and must capture *every* attempt
 * (including ones that failed and were retried) — not just the one that
 * eventually stuck. `calculationVersion` lets a future change to
 * settlement/payout logic be distinguished from historical rows without
 * ever needing to reinterpret them.
 */
export const betSettlementAudits = pgTable(
  'bet_settlement_audits',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    betId: uuid('bet_id')
      .notNull()
      .references(() => bets.id, { onDelete: 'restrict' }),
    attemptedAt: timestamp('attempted_at', { withTimezone: true }).notNull().defaultNow(),
    calculationVersion: integer('calculation_version').notNull(),
    openingPrice: bigint('opening_price', { mode: 'bigint' }).notNull(),
    openingPriceSource: varchar('opening_price_source', { length: 64 }).notNull(),
    openingPriceObservedAt: timestamp('opening_price_observed_at', { withTimezone: true }).notNull(),
    // Null when the attempt failed before a settlement price could be obtained.
    closingPrice: bigint('closing_price', { mode: 'bigint' }),
    closingPriceSource: varchar('closing_price_source', { length: 64 }),
    closingPriceObservedAt: timestamp('closing_price_observed_at', { withTimezone: true }),
    stakeAmount: bigint('stake_amount', { mode: 'bigint' }).notNull(),
    payoutRateBasisPoints: bigint('payout_rate_basis_points', { mode: 'bigint' }).notNull(),
    // Set only when outcome = 'win'.
    computedPayout: bigint('computed_payout', { mode: 'bigint' }),
    outcome: settlementOutcomeEnum('outcome').notNull(),
    // The bet's resulting status after this attempt — null for a failed attempt that was simply retried.
    finalStatus: betStatusEnum('final_status'),
    settlementTransactionId: uuid('settlement_transaction_id').references(() => transactions.id, {
      onDelete: 'restrict',
    }),
    isManualResolution: boolean('is_manual_resolution').notNull().default(false),
    actorUserId: uuid('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
    errorCode: varchar('error_code', { length: 64 }),
    errorMessage: text('error_message'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('bet_settlement_audits_bet_id_attempted_at_idx').on(table.betId, table.attemptedAt),
    index('bet_settlement_audits_outcome_idx').on(table.outcome),
  ],
);

export type BetSettlementAudit = typeof betSettlementAudits.$inferSelect;
export type NewBetSettlementAudit = typeof betSettlementAudits.$inferInsert;
