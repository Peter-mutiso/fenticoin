import { index, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

import { users } from './users';

/**
 * TOTP secret, encrypted at rest (AES-256-GCM, see
 * `common/crypto/encryption.service.ts`) with a key that lives only in the
 * backend's environment — never derivable from anything in this table.
 * `enabledAt` is null while setup is pending confirmation.
 */
export const twoFactorMethods = pgTable('two_factor_methods', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: 'cascade' }),
  method: varchar('method', { length: 10 }).notNull().default('totp'),
  secretCiphertext: varchar('secret_ciphertext', { length: 512 }).notNull(),
  enabledAt: timestamp('enabled_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const twoFactorBackupCodes = pgTable(
  'two_factor_backup_codes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    codeHash: varchar('code_hash', { length: 128 }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('two_factor_backup_codes_user_id_idx').on(table.userId)],
);

export type TwoFactorMethod = typeof twoFactorMethods.$inferSelect;
export type NewTwoFactorMethod = typeof twoFactorMethods.$inferInsert;
export type TwoFactorBackupCode = typeof twoFactorBackupCodes.$inferSelect;
export type NewTwoFactorBackupCode = typeof twoFactorBackupCodes.$inferInsert;
