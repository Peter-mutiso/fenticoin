import { Controller, Get, Query } from '@nestjs/common';

import { RequirePermissions } from '../authorization/decorators/require-permissions.decorator';
import { PERMISSIONS } from '../authorization/permissions.catalog';
import { AuditLogService } from './audit-log.service';
import { ListAuditLogsQueryDto } from './dto/list-audit-logs-query.dto';

/**
 * Read-only view over the append-only `audit_logs` table. Nothing here
 * writes — every event is recorded elsewhere via `AuditLogService.record()`
 * at the point of the action itself.
 */
@Controller('admin/audit-logs')
export class AuditLogController {
  constructor(private readonly auditLog: AuditLogService) {}

  @RequirePermissions(PERMISSIONS.AUDIT_VIEW)
  @Get()
  async list(@Query() query: ListAuditLogsQueryDto) {
    return this.auditLog.list({
      actorUserId: query.actorUserId,
      targetType: query.targetType,
      targetId: query.targetId,
      action: query.action,
      from: query.from,
      to: query.to,
      limit: query.limit ?? 25,
      offset: query.offset ?? 0,
    });
  }
}
