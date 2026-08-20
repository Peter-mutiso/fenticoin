import { index, integer, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

import { verificationTokenTypeEnum } from './enums';
import { users } from './users';

/**
 * Backs email verification, phone OTP, and password reset. Only ever
 * stores a SHA-256 hash of the raw token/code — never the value itself —
 * so a database read can't be used to impersonate a user.
 */
export const verificationTokens = pgTable(
  'verification_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: verificationTokenTypeEnum('type').notNull(),
    identifier: varchar('identifier', { length: 320 }).notNull(),
    tokenHash: varchar('token_hash', { length: 128 }).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
    attempts: integer('attempts').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('verification_tokens_user_id_type_idx').on(table.userId, table.type),
    index('verification_tokens_expires_at_idx').on(table.expiresAt),
    index('verification_tokens_type_token_hash_idx').on(table.type, table.tokenHash),
  ],
);

export type VerificationToken = typeof verificationTokens.$inferSelect;
export type NewVerificationToken = typeof verificationTokens.$inferInsert;
