import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, gte, lte } from 'drizzle-orm';

import { DRIZZLE_CLIENT } from '../database/database.constants';
import type { DrizzleDb } from '../database/database.types';
import { type AuditLog, auditLogs } from '../database/schema';

export interface RecordAuditEventInput {
  actorUserId: string | null;
  actorType?: 'user' | 'admin' | 'system';
  action: string;
  targetType?: string;
  targetId?: string;
  before?: unknown;
  after?: unknown;
  ipAddress?: string;
  userAgent?: string;
  metadata?: unknown;
}

export interface ListAuditLogsFilters {
  actorUserId?: string;
  targetType?: string;
  targetId?: string;
  action?: string;
  from?: string;
  to?: string;
  limit: number;
  offset: number;
}

/**
 * The only writer of `audit_logs`. Every call is an INSERT — nothing in
 * this codebase should ever UPDATE or DELETE a row here (see the schema
 * file's comment on the production DB-role hardening this still needs).
 */
@Injectable()
export class AuditLogService {
  constructor(@Inject(DRIZZLE_CLIENT) private readonly db: DrizzleDb) {}

  async record(event: RecordAuditEventInput, tx?: DrizzleDb): Promise<void> {
    await (tx ?? this.db).insert(auditLogs).values({
      actorUserId: event.actorUserId,
      actorType: event.actorType ?? 'user',
      action: event.action,
      targetType: event.targetType,
      targetId: event.targetId,
      before: event.before,
      after: event.after,
      ipAddress: event.ipAddress,
      userAgent: event.userAgent,
      metadata: event.metadata,
    });
  }

  /** Read side, for the admin audit-log view. Every filter is optional and independently composed. */
  async list(filters: ListAuditLogsFilters): Promise<{ items: AuditLog[] }> {
    const conditions = [
      filters.actorUserId ? eq(auditLogs.actorUserId, filters.actorUserId) : undefined,
      filters.targetType ? eq(auditLogs.targetType, filters.targetType) : undefined,
      filters.targetId ? eq(auditLogs.targetId, filters.targetId) : undefined,
      filters.action ? eq(auditLogs.action, filters.action) : undefined,
      filters.from ? gte(auditLogs.createdAt, new Date(filters.from)) : undefined,
      filters.to ? lte(auditLogs.createdAt, new Date(filters.to)) : undefined,
    ].filter((condition): condition is NonNullable<typeof condition> => condition !== undefined);

    const items = await this.db
      .select()
      .from(auditLogs)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(auditLogs.createdAt))
      .limit(filters.limit)
      .offset(filters.offset);

    return { items };
  }
}
