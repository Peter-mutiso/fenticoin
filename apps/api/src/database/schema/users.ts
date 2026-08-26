import { sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  check,
  date,
  index,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { accountStatusEnum, accountTypeEnum, eligibilityStatusEnum, kycStatusEnum } from './enums';

/**
 * Core identity record. Deliberately holds only auth/compliance-critical
 * fields (email, phone, status, KYC/eligibility) — cosmetic profile data
 * lives in `user_profiles` so this table stays small and hot-path-friendly.
 *
 * Emails are normalized (lowercased) at the application layer before write
 * — see `UsersService.normalizeEmail` — so the plain unique index below is
 * sufficient without a functional index.
 */
export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: varchar('email', { length: 320 }).notNull().unique(),
    emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),
    phone: varchar('phone', { length: 32 }).unique(),
    phoneVerifiedAt: timestamp('phone_verified_at', { withTimezone: true }),
    status: accountStatusEnum('status').notNull().default('active'),
    kycStatus: kycStatusEnum('kyc_status').notNull().default('unverified'),
    eligibilityStatus: eligibilityStatusEnum('eligibility_status').notNull().default('unknown'),
    dateOfBirth: date('date_of_birth', { mode: 'string' }),
    accountType: accountTypeEnum('account_type').notNull().default('real'),
    // Set only on a `demo` row — points back to the one real user this demo
    // shadow belongs to. `onDelete: 'cascade'` so deleting a real user takes
    // their demo shadow (and everything under it) with them. The unique
    // index below is what makes this 1:1 rather than 1:many.
    demoOfUserId: uuid('demo_of_user_id').references((): AnyPgColumn => users.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('users_status_idx').on(table.status),
    index('users_kyc_status_idx').on(table.kycStatus),
    index('users_created_at_idx').on(table.createdAt),
    index('users_account_type_idx').on(table.accountType),
    uniqueIndex('users_demo_of_user_id_idx')
      .on(table.demoOfUserId)
      .where(sql`${table.demoOfUserId} IS NOT NULL`),
    // Defense-in-depth floor only — the real, jurisdiction-specific minimum
    // age/eligibility policy is enforced in the application layer and is a
    // compliance decision, not a hardcoded constant (see docs/ARCHITECTURE.md
    // §"Requirements you didn't mention" item 1).
    check(
      'users_date_of_birth_min_age_floor',
      sql`${table.dateOfBirth} IS NULL OR ${table.dateOfBirth} <= (current_date - interval '18 years')`,
    ),
    check(
      'users_account_type_shape',
      sql`(${table.accountType} = 'demo' AND ${table.demoOfUserId} IS NOT NULL) OR (${table.accountType} = 'real' AND ${table.demoOfUserId} IS NULL)`,
    ),
  ],
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
