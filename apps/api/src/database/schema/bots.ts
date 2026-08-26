import { pgEnum, pgTable, index, jsonb, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

import { bets } from './betting';
import { users } from './users';

export const botStatusEnum = pgEnum('bot_status', ['inactive', 'active', 'strategy_unconfigured']);

/**
 * A user-owned automated strategy runner. Unlike most tables here, a user
 * may own many — the screenshots/product spec this was built from show
 * several independently configured bots running side by side, so there is
 * deliberately no per-user uniqueness constraint (an earlier revision of
 * this table had one; it was removed). `config` holds strategy-specific
 * parameters (instrument, stake, cadence, thresholds — see
 * `strategy-catalog.ts` for the field list per `strategyKey`); it is
 * intentionally opaque JSON here because its shape is owned by the
 * strategy, not by the schema. A bot never mutates a balance directly —
 * see `BotExecutionService`, which is the only code that reads this table
 * and always acts through `BettingService.placeBet`.
 */
export const bots = pgTable('bots', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  name: varchar('name', { length: 80 }).notNull(),
  status: botStatusEnum('status').notNull().default('strategy_unconfigured'),
  strategyKey: text('strategy_key'),
  config: jsonb('config').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('bots_user_id_idx').on(table.userId),
  index('bots_status_idx').on(table.status),
]);

export type Bot = typeof bots.$inferSelect;
export type NewBot = typeof bots.$inferInsert;

export const botLogLevelEnum = pgEnum('bot_log_level', ['info', 'success', 'skipped', 'error']);

/**
 * An append-only record of every scheduler attempt to run a bot — never
 * updated or deleted, mirroring `bet_settlement_audits`'s "capture every
 * attempt, not just the ones that stuck" philosophy. This is a diagnostic
 * log, not a financial record: `signal` is the raw `StrategySignal` that
 * was evaluated, kept only for explainability, and `message` must never
 * contain a fabricated outcome — any profit/loss the UI shows is always
 * read from the linked `bet` row's real, settled state at render time,
 * never from this table.
 */
export const tradingBotLogs = pgTable('trading_bot_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  botId: uuid('bot_id').notNull().references(() => bots.id, { onDelete: 'restrict' }),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
  level: botLogLevelEnum('level').notNull(),
  message: text('message').notNull(),
  betId: uuid('bet_id').references(() => bets.id, { onDelete: 'set null' }),
  signal: jsonb('signal'),
}, (table) => [
  index('trading_bot_logs_bot_id_occurred_at_idx').on(table.botId, table.occurredAt),
]);

export type TradingBotLog = typeof tradingBotLogs.$inferSelect;
export type NewTradingBotLog = typeof tradingBotLogs.$inferInsert;
