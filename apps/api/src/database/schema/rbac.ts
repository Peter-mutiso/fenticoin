import { boolean, pgTable, primaryKey, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

import { users } from './users';

/** The fixed catalog of assignable roles. Seeded from `roles.catalog.ts`, never user-created. */
export const roles = pgTable('roles', {
  key: varchar('key', { length: 30 }).primaryKey(),
  description: text('description').notNull(),
  isSystem: boolean('is_system').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/** The fixed catalog of granular permissions. Seeded from `permissions.catalog.ts`. */
export const permissions = pgTable('permissions', {
  key: varchar('key', { length: 60 }).primaryKey(),
  description: text('description').notNull(),
  category: varchar('category', { length: 30 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const rolePermissions = pgTable(
  'role_permissions',
  {
    roleKey: varchar('role_key', { length: 30 })
      .notNull()
      .references(() => roles.key, { onDelete: 'cascade' }),
    permissionKey: varchar('permission_key', { length: 60 })
      .notNull()
      .references(() => permissions.key, { onDelete: 'cascade' }),
  },
  (table) => [primaryKey({ columns: [table.roleKey, table.permissionKey] })],
);

/**
 * Which roles a user holds. A brand-new user gets an explicit `user` row
 * (see `AuthService.register`) rather than treating "no roles" as an
 * implicit default — that keeps permission resolution a single uniform
 * join with no special-casing.
 */
export const userRoles = pgTable(
  'user_roles',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    roleKey: varchar('role_key', { length: 30 })
      .notNull()
      .references(() => roles.key, { onDelete: 'cascade' }),
    grantedBy: uuid('granted_by').references(() => users.id, { onDelete: 'set null' }),
    grantedAt: timestamp('granted_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.roleKey] })],
);

export type Role = typeof roles.$inferSelect;
export type Permission = typeof permissions.$inferSelect;
export type UserRole = typeof userRoles.$inferSelect;
