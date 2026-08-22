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

  describe('reviewKyc', () => {
    it('throws when the target user does not exist', async () => {
      const select = jest.fn().mockReturnValue(chainable([]));
      const db = { select } as unknown as DrizzleDb;
      const service = new UsersService(db, {} as SessionService, { record: jest.fn() } as unknown as AuditLogService);

      await expect(
        service.reviewKyc({ userId: 'missing', decision: 'approve', reason: 'looks good', actorUserId: 'admin-1' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('approves KYC and records an audit entry with before/after status', async () => {
      const select = jest.fn().mockReturnValue(chainable([{ id: 'user-1', kycStatus: 'pending' }]));
      const update = jest.fn().mockReturnValue(chainable([{ id: 'user-1', kycStatus: 'approved' }]));
      const db = { select, update } as unknown as DrizzleDb;
      const auditLog = { record: jest.fn() } as unknown as AuditLogService;
      const service = new UsersService(db, {} as SessionService, auditLog);

      const result = await service.reviewKyc({
        userId: 'user-1',
        decision: 'approve',
        reason: 'documents verified',
        actorUserId: 'admin-1',
      });

      expect(result.kycStatus).toBe('approved');
      expect(auditLog.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'user.kyc_reviewed',
          targetId: 'user-1',
          before: { kycStatus: 'pending' },
          after: { kycStatus: 'approved', reason: 'documents verified' },
        }),
      );
    });

    it('rejects KYC and records the rejection reason', async () => {
      const select = jest.fn().mockReturnValue(chainable([{ id: 'user-1', kycStatus: 'pending' }]));
      const update = jest.fn().mockReturnValue(chainable([{ id: 'user-1', kycStatus: 'rejected' }]));
      const db = { select, update } as unknown as DrizzleDb;
      const auditLog = { record: jest.fn() } as unknown as AuditLogService;
      const service = new UsersService(db, {} as SessionService, auditLog);

      const result = await service.reviewKyc({
        userId: 'user-1',
        decision: 'reject',
        reason: 'document mismatch',
        actorUserId: 'admin-1',
      });

      expect(result.kycStatus).toBe('rejected');
      expect(auditLog.record).toHaveBeenCalledWith(
        expect.objectContaining({ after: { kycStatus: 'rejected', reason: 'document mismatch' } }),
      );
    });
  });

  describe('setEligibility', () => {
    it('throws when the target user does not exist', async () => {
      const select = jest.fn().mockReturnValue(chainable([]));
      const db = { select } as unknown as DrizzleDb;
      const service = new UsersService(db, {} as SessionService, { record: jest.fn() } as unknown as AuditLogService);

      await expect(
        service.setEligibility({ userId: 'missing', status: 'ineligible', reason: 'risk review', actorUserId: 'admin-1' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('restricts an account and records before/after eligibility with the reason', async () => {
      const select = jest.fn().mockReturnValue(chainable([{ id: 'user-1', eligibilityStatus: 'unknown' }]));
      const update = jest.fn().mockReturnValue(chainable([{ id: 'user-1', eligibilityStatus: 'ineligible' }]));
      const db = { select, update } as unknown as DrizzleDb;
      const auditLog = { record: jest.fn() } as unknown as AuditLogService;
      const service = new UsersService(db, {} as SessionService, auditLog);

      const result = await service.setEligibility({
        userId: 'user-1',
        status: 'ineligible',
        reason: 'suspicious betting pattern',
        actorUserId: 'admin-1',
      });

      expect(result.eligibilityStatus).toBe('ineligible');
      expect(auditLog.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'user.eligibility_changed',
          targetId: 'user-1',
          before: { eligibilityStatus: 'unknown' },
          after: { eligibilityStatus: 'ineligible', reason: 'suspicious betting pattern' },
        }),
      );
    });
  });

  describe('list', () => {
    it('composes email/status/kycStatus filters only when provided', async () => {
      const select = jest.fn().mockReturnValue(chainable([]));
      const db = { select } as unknown as DrizzleDb;
      const service = new UsersService(db, {} as SessionService, {} as AuditLogService);

      await service.list({ limit: 25, offset: 0 });
      await service.list({ email: 'trader@', status: 'active', kycStatus: 'approved', limit: 25, offset: 0 });

      expect(select).toHaveBeenCalledTimes(2);
    });
  });
});
