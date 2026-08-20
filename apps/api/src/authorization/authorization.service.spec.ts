import { ConflictException } from '@nestjs/common';

import type { AuditLogService } from '../audit/audit-log.service';
import type { DrizzleDb } from '../database/database.types';
import { chainable } from '../test-utils/mock-drizzle';
import { AuthorizationService } from './authorization.service';
import { ROLES } from './roles.catalog';

describe('AuthorizationService', () => {
  function makeService(db: Partial<DrizzleDb>, auditLog: Partial<AuditLogService> = {}) {
    const audit = { record: jest.fn(), ...auditLog } as unknown as AuditLogService;
    const service = new AuthorizationService(db as DrizzleDb, audit);
    return { service, audit };
  }

  describe('resolve', () => {
    it('returns no roles/permissions for a user with no role rows', async () => {
      const select = jest.fn().mockReturnValueOnce(chainable([]));
      const { service } = makeService({ select } as unknown as Partial<DrizzleDb>);

      const result = await service.resolve('user-1');
      expect(result).toEqual({ roles: [], permissions: [] });
      expect(select).toHaveBeenCalledTimes(1); // short-circuits, no permission query
    });

    it('resolves roles and their deduplicated permissions', async () => {
      const select = jest
        .fn()
        .mockReturnValueOnce(chainable([{ roleKey: ROLES.SUPPORT }]))
        .mockReturnValueOnce(
          chainable([{ permissionKey: 'users.view' }, { permissionKey: 'users.view' }, { permissionKey: 'kyc.view' }]),
        );
      const { service } = makeService({ select } as unknown as Partial<DrizzleDb>);

      const result = await service.resolve('user-1');
      expect(result.roles).toEqual([ROLES.SUPPORT]);
      expect(result.permissions.sort()).toEqual(['kyc.view', 'users.view']);
    });
  });

  describe('assignRole', () => {
    it('rejects an unknown role key without touching the database', async () => {
      const select = jest.fn();
      const insert = jest.fn();
      const { service } = makeService({ select, insert } as unknown as Partial<DrizzleDb>);

      await expect(
        service.assignRole({
          targetUserId: 'user-1',
          // @ts-expect-error intentionally invalid
          roleKey: 'not_a_real_role',
          actorUserId: 'admin-1',
        }),
      ).rejects.toThrow('Unknown role');
      expect(insert).not.toHaveBeenCalled();
    });

    it('inserts the role and writes an audit log entry', async () => {
      const insert = jest.fn().mockReturnValue(chainable(undefined));
      const { service, audit } = makeService({ insert } as unknown as Partial<DrizzleDb>);

      await service.assignRole({ targetUserId: 'user-1', roleKey: ROLES.SUPPORT, actorUserId: 'admin-1' });

      expect(insert).toHaveBeenCalled();
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'role.granted', targetId: 'user-1' }),
      );
    });
  });

  describe('revokeRole', () => {
    it('is a no-op when the user does not have the role', async () => {
      const select = jest.fn().mockReturnValueOnce(chainable([]));
      const del = jest.fn();
      const { service, audit } = makeService({ select, delete: del } as unknown as Partial<DrizzleDb>);

      await service.revokeRole({ targetUserId: 'user-1', roleKey: ROLES.SUPPORT, actorUserId: 'admin-1' });

      expect(del).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
    });

    it('deletes the role and writes an audit log entry for a normal role', async () => {
      const select = jest.fn().mockReturnValueOnce(chainable([{ userId: 'user-1', roleKey: ROLES.SUPPORT }]));
      const del = jest.fn().mockReturnValue(chainable(undefined));
      const { service, audit } = makeService({ select, delete: del } as unknown as Partial<DrizzleDb>);

      await service.revokeRole({ targetUserId: 'user-1', roleKey: ROLES.SUPPORT, actorUserId: 'admin-1' });

      expect(del).toHaveBeenCalled();
      expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'role.revoked' }));
    });

    it('refuses to revoke the last super_admin', async () => {
      const select = jest
        .fn()
        .mockReturnValueOnce(chainable([{ userId: 'user-1', roleKey: ROLES.SUPER_ADMIN }])) // existing check
        .mockReturnValueOnce(chainable([{ userId: 'user-1' }])); // count check: only 1 super_admin
      const del = jest.fn();
      const { service } = makeService({ select, delete: del } as unknown as Partial<DrizzleDb>);

      await expect(
        service.revokeRole({ targetUserId: 'user-1', roleKey: ROLES.SUPER_ADMIN, actorUserId: 'admin-1' }),
      ).rejects.toThrow(ConflictException);
      expect(del).not.toHaveBeenCalled();
    });

    it('allows revoking a super_admin when another one remains', async () => {
      const select = jest
        .fn()
        .mockReturnValueOnce(chainable([{ userId: 'user-1', roleKey: ROLES.SUPER_ADMIN }]))
        .mockReturnValueOnce(chainable([{ userId: 'user-1' }, { userId: 'user-2' }]));
      const del = jest.fn().mockReturnValue(chainable(undefined));
      const { service } = makeService({ select, delete: del } as unknown as Partial<DrizzleDb>);

      await expect(
        service.revokeRole({ targetUserId: 'user-1', roleKey: ROLES.SUPER_ADMIN, actorUserId: 'admin-1' }),
      ).resolves.toBeUndefined();
      expect(del).toHaveBeenCalled();
    });
  });
});
