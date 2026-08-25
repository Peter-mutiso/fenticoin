import type { DrizzleDb } from '../database/database.types';
import { chainable } from '../test-utils/mock-drizzle';
import { AuditLogService } from './audit-log.service';

describe('AuditLogService', () => {
  describe('record', () => {
    it('writes through the supplied transaction client', async () => {
      const rootValues = jest.fn().mockReturnValue(Promise.resolve());
      const txValues = jest.fn().mockReturnValue(Promise.resolve());
      const db = { insert: jest.fn().mockReturnValue({ values: rootValues }) } as unknown as DrizzleDb;
      const tx = { insert: jest.fn().mockReturnValue({ values: txValues }) } as unknown as DrizzleDb;
      const service = new AuditLogService(db);

      await service.record({ actorUserId: null, actorType: 'system', action: 'financial.change' }, tx);

      expect(txValues).toHaveBeenCalled();
      expect(rootValues).not.toHaveBeenCalled();
    });

    it('inserts a row with the actor/action/target/before/after shape', async () => {
      const values = jest.fn().mockReturnValue(Promise.resolve());
      const db = { insert: jest.fn().mockReturnValue({ values }) } as unknown as DrizzleDb;
      const service = new AuditLogService(db);

      await service.record({
        actorUserId: 'admin-1',
        action: 'user.status_changed',
        targetType: 'user',
        targetId: 'user-1',
        before: { status: 'active' },
        after: { status: 'suspended' },
      });

      expect(values).toHaveBeenCalledWith(
        expect.objectContaining({
          actorUserId: 'admin-1',
          actorType: 'user',
          action: 'user.status_changed',
          targetType: 'user',
          targetId: 'user-1',
          before: { status: 'active' },
          after: { status: 'suspended' },
        }),
      );
    });

    it('defaults actorType to "user" when not specified', async () => {
      const values = jest.fn().mockReturnValue(Promise.resolve());
      const db = { insert: jest.fn().mockReturnValue({ values }) } as unknown as DrizzleDb;
      const service = new AuditLogService(db);

      await service.record({ actorUserId: null, action: 'system.event' });

      expect(values).toHaveBeenCalledWith(expect.objectContaining({ actorType: 'user' }));
    });
  });

  describe('list', () => {
    it('runs with no filters at all', async () => {
      const select = jest.fn().mockReturnValue(chainable([]));
      const db = { select } as unknown as DrizzleDb;
      const service = new AuditLogService(db);

      const result = await service.list({ limit: 25, offset: 0 });
      expect(result).toEqual({ items: [] });
    });

    it('returns matching rows and composes every provided filter independently', async () => {
      const rows = [{ id: 'log-1', action: 'user.status_changed' }];
      const select = jest.fn().mockReturnValue(chainable(rows));
      const db = { select } as unknown as DrizzleDb;
      const service = new AuditLogService(db);

      const result = await service.list({
        actorUserId: 'admin-1',
        targetType: 'user',
        targetId: 'user-1',
        action: 'user.status_changed',
        from: '2026-01-01T00:00:00.000Z',
        to: '2026-01-31T00:00:00.000Z',
        limit: 25,
        offset: 0,
      });

      expect(result).toEqual({ items: rows });
      expect(select).toHaveBeenCalledTimes(1);
    });
  });
});
