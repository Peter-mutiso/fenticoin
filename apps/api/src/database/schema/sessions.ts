import { index, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

import { sessionRevokedReasonEnum } from './enums';
import { users } from './users';

/**
 * A refresh-token session. Access (JWT) tokens are stateless and short
 * lived; this table is what actually makes a login revocable — logout,
 * "log out everywhere", password change, and admin action all work by
 * revoking rows here, not by trying to invalidate a JWT.
 */
export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    refreshTokenHash: varchar('refresh_token_hash', { length: 128 }).notNull().unique(),
    userAgent: varchar('user_agent', { length: 512 }),
    ipAddress: varchar('ip_address', { length: 45 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    revokedReason: sessionRevokedReasonEnum('revoked_reason'),
    replacedBySessionId: uuid('replaced_by_session_id'),
  },
  (table) => [
    index('sessions_user_id_idx').on(table.userId),
    index('sessions_expires_at_idx').on(table.expiresAt),
  ],
);

export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;
