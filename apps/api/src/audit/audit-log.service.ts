import { Inject, Injectable } from '@nestjs/common';

import { DRIZZLE_CLIENT } from '../database/database.constants';
import type { DrizzleDb } from '../database/database.types';
import { auditLogs } from '../database/schema';

export interface RecordAuditEventInput {
  actorUserId: string | null;
  actorType?: 'user' | 'system';
  action: string;
  targetType?: string;
  targetId?: string;
  before?: unknown;
  after?: unknown;
  ipAddress?: string;
  userAgent?: string;
  metadata?: unknown;
}

/**
 * The only writer of `audit_logs`. Every call is an INSERT — nothing in
 * this codebase should ever UPDATE or DELETE a row here (see the schema
 * file's comment on the production DB-role hardening this still needs).
 */
@Injectable()
export class AuditLogService {
  constructor(@Inject(DRIZZLE_CLIENT) private readonly db: DrizzleDb) {}

  async record(event: RecordAuditEventInput): Promise<void> {
    await this.db.insert(auditLogs).values({
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
}
