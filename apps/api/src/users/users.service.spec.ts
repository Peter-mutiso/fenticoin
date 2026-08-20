import { NotFoundException } from '@nestjs/common';

import type { AuditLogService } from '../audit/audit-log.service';
import type { SessionService } from '../auth/services/session.service';
import type { DrizzleDb } from '../database/database.types';
import { chainable } from '../test-utils/mock-drizzle';
import { UsersService } from './users.service';

describe('UsersService', () => {
  it('normalizes email to trimmed lowercase', () => {
    const service = new UsersService({} as DrizzleDb, {} as SessionService, {} as AuditLogService);
    expect(service.normalizeEmail('  User@Example.COM  ')).toBe('user@example.com');
  });

  describe('setStatus', () => {
    it('throws when the target user does not exist', async () => {
      const select = jest.fn().mockReturnValue(chainable([]));
      const db = { select } as unknown as DrizzleDb;
      const sessionService = { revokeAllForUser: jest.fn() } as unknown as SessionService;
      const auditLog = { record: jest.fn() } as unknown as AuditLogService;
      const service = new UsersService(db, sessionService, auditLog);

      await expect(
        service.setStatus({ userId: 'missing', status: 'suspended', actorUserId: 'admin-1' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('revokes all sessions and records an audit entry when suspending', async () => {
      const select = jest.fn().mockReturnValue(chainable([{ id: 'user-1', status: 'active' }]));
      const update = jest.fn().mockReturnValue(chainable([{ id: 'user-1', status: 'suspended' }]));
      const db = { select, update } as unknown as DrizzleDb;
      const sessionService = { revokeAllForUser: jest.fn() } as unknown as SessionService;
      const auditLog = { record: jest.fn() } as unknown as AuditLogService;
      const service = new UsersService(db, sessionService, auditLog);

      const result = await service.setStatus({
        userId: 'user-1',
        status: 'suspended',
        actorUserId: 'admin-1',
        reason: 'fraud review',
      });

      expect(result.status).toBe('suspended');
      expect(sessionService.revokeAllForUser).toHaveBeenCalledWith('user-1', 'account_suspended');
      expect(auditLog.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'user.status_changed',
          targetId: 'user-1',
          before: { status: 'active' },
          after: { status: 'suspended', reason: 'fraud review' },
        }),
      );
    });

    it('does not revoke sessions when reactivating an account', async () => {
      const select = jest.fn().mockReturnValue(chainable([{ id: 'user-1', status: 'suspended' }]));
      const update = jest.fn().mockReturnValue(chainable([{ id: 'user-1', status: 'active' }]));
      const db = { select, update } as unknown as DrizzleDb;
      const sessionService = { revokeAllForUser: jest.fn() } as unknown as SessionService;
      const auditLog = { record: jest.fn() } as unknown as AuditLogService;
      const service = new UsersService(db, sessionService, auditLog);

      await service.setStatus({ userId: 'user-1', status: 'active', actorUserId: 'admin-1' });
      expect(sessionService.revokeAllForUser).not.toHaveBeenCalled();
    });
  });
});
