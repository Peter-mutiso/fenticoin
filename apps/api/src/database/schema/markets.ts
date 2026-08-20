import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { instrumentStatusEnum } from './enums';
import { users } from './users';

/**
 * A small, admin-extensible taxonomy ('crypto' today; 'forex'/'stocks'
 * later) — not a hardcoded enum, so adding a new category never requires
 * a migration. Seeded like `roles`/`permissions`, not baked into code.
 */
export const marketCategories = pgTable('market_categories', {
  key: varchar('key', { length: 30 }).primaryKey(),
  name: varchar('name', { length: 60 }).notNull(),
  description: text('description'),
  displayOrder: integer('display_order').notNull().default(0),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type MarketCategory = typeof marketCategories.$inferSelect;
export type NewMarketCategory = typeof marketCategories.$inferInsert;

/**
 * A tradable instrument (asset/symbol), e.g. BTC priced in USD. The
 * *initial* set (BTC/ETH/SOL/XRP) is seed *data* — see
 * `database/seed/seed-instruments.ts` — never a hardcoded list in
 * application code, so admins can add/edit/retire instruments without a
 * deploy. `providerSymbol` decouples our own `symbol` from whatever id a
 * given market-data provider uses for the same asset (e.g. CoinGecko's
 * `bitcoin` vs our `BTC`).
 */
export const instruments = pgTable(
  'instruments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    symbol: varchar('symbol', { length: 20 }).notNull(),
    quoteCurrency: varchar('quote_currency', { length: 3 }).notNull(),
    displaySymbol: varchar('display_symbol', { length: 24 }).notNull(),
    name: varchar('name', { length: 80 }).notNull(),
    categoryKey: varchar('category_key', { length: 30 })
      .notNull()
      .references(() => marketCategories.key, { onDelete: 'restrict' }),
    providerSymbol: varchar('provider_symbol', { length: 60 }),
    // Number of decimal places prices for this instrument are quoted and
    // stored at — e.g. 2 for BTC/USD ($112,503.27). `price_ticks.price` is
    // always an integer count of this many decimal places, never a float.
    pricePrecision: smallint('price_precision').notNull().default(2),
    status: instrumentStatusEnum('status').notNull().default('active'),
    // How old the latest tick is allowed to be before it's considered
    // untrustworthy (`PriceFeedService.getLatestPrice` throws past this).
    maxPriceAgeSeconds: integer('max_price_age_seconds').notNull().default(30),
    // null = always open (e.g. crypto, 24/7). Structured schedule
    // otherwise — see `MarketSessionSchedule` in market-session.ts.
    tradingSchedule: jsonb('trading_schedule'),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('instruments_symbol_quote_currency_idx').on(table.symbol, table.quoteCurrency),
    index('instruments_category_key_idx').on(table.categoryKey),
    index('instruments_status_idx').on(table.status),
    check('instruments_price_precision_range', sql`${table.pricePrecision} BETWEEN 0 AND 8`),
    check('instruments_max_price_age_positive', sql`${table.maxPriceAgeSeconds} > 0`),
  ],
);

export type Instrument = typeof instruments.$inferSelect;
export type NewInstrument = typeof instruments.$inferInsert;

/**
 * Append-only price history — nothing ever updates or deletes a row here,
 * mirroring `ledger_entries`'s immutability. `observedAt` is when the
 * provider says the price was true; `receivedAt` is when we ingested it
 * (usually milliseconds apart, but the distinction matters for a provider
 * that batches/delays). `price` is an integer scaled to the owning
 * instrument's `pricePrecision` — see `PriceQuote`/`toPriceMoney` in
 * `price-quote.ts` for the exact-arithmetic wrapper around it.
 */
export const priceTicks = pgTable(
  'price_ticks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    instrumentId: uuid('instrument_id')
      .notNull()
      .references(() => instruments.id, { onDelete: 'restrict' }),
    price: bigint('price', { mode: 'bigint' }).notNull(),
    source: varchar('source', { length: 60 }).notNull(),
    observedAt: timestamp('observed_at', { withTimezone: true }).notNull(),
    receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('price_ticks_instrument_id_observed_at_idx').on(table.instrumentId, table.observedAt),
    check('price_ticks_price_positive', sql`${table.price} > 0`),
  ],
);

export type PriceTick = typeof priceTicks.$inferSelect;
export type NewPriceTick = typeof priceTicks.$inferInsert;
