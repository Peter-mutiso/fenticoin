import { sql } from 'drizzle-orm';
import { pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

import { users } from './users';

export const botStatusEnum = pgEnum('bot_status', ['inactive', 'active', 'strategy_unconfigured']);

export const bots = pgTable('bots', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  status: botStatusEnum('status').notNull().default('strategy_unconfigured'),
  strategyKey: text('strategy_key'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('bots_user_id_idx').on(table.userId),
  uniqueIndex('bots_strategy_key_idx').on(table.id, table.strategyKey).where(sql`${table.strategyKey} IS NOT NULL`),
]);

export type Bot = typeof bots.$inferSelect;
export type NewBot = typeof bots.$inferInsert;