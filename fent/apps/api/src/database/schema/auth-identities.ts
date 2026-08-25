import { jsonb, pgTable, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';

import { authProviderEnum } from './enums';
import { users } from './users';

/**
 * One row per way a user can authenticate. `provider = 'password'` rows
 * carry `passwordHash`; `provider = 'google'` rows carry Google's `sub` in
 * `providerUserId`; `provider = 'phone'` rows carry the E.164 number there.
 * Modeling auth methods this way (rather than columns on `users`) is what
 * lets a user hold several linked methods without schema changes later.
 */
export const authIdentities = pgTable(
  'auth_identities',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    provider: authProviderEnum('provider').notNull(),
    providerUserId: varchar('provider_user_id', { length: 255 }),
    passwordHash: varchar('password_hash', { length: 255 }),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('auth_identities_provider_provider_user_id_idx').on(
      table.provider,
      table.providerUserId,
    ),
    uniqueIndex('auth_identities_user_id_provider_idx').on(table.userId, table.provider),
  ],
);

export type AuthIdentity = typeof authIdentities.$inferSelect;
export type NewAuthIdentity = typeof authIdentities.$inferInsert;
