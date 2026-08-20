import { index, jsonb, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

import { auditActorTypeEnum } from './enums';
import { users } from './users';

/**
 * Append-only. Nothing in this codebase issues an UPDATE or DELETE against
 * this table — see `AuditLogService`, which only ever inserts. In
 * production this must additionally be enforced at the database-role level
 * (REVOKE UPDATE, DELETE ... FROM the app's connection role); that is an
 * infra-level step tracked in docs/ARCHITECTURE.md §M, since it depends on
 * which non-superuser role the deployed app actually connects as.
 */
export const auditLogs = pgTable(
  'audit_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    actorUserId: uuid('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
    actorType: auditActorTypeEnum('actor_type').notNull().default('user'),
    action: varchar('action', { length: 60 }).notNull(),
    targetType: varchar('target_type', { length: 30 }),
    targetId: varchar('target_id', { length: 64 }),
    before: jsonb('before'),
    after: jsonb('after'),
    ipAddress: varchar('ip_address', { length: 45 }),
    userAgent: varchar('user_agent', { length: 512 }),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('audit_logs_actor_user_id_idx').on(table.actorUserId),
    index('audit_logs_action_idx').on(table.action),
    index('audit_logs_target_idx').on(table.targetType, table.targetId),
    index('audit_logs_created_at_idx').on(table.createdAt),
  ],
);

export type AuditLog = typeof auditLogs.$inferSelect;
export type NewAuditLog = typeof auditLogs.$inferInsert;
