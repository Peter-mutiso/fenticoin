import type { AuditLogService } from '../audit/audit-log.service';
import type { DrizzleDb } from '../database/database.types';
import { chainable } from '../test-utils/mock-drizzle';
import { BettingConfigService } from './betting-config.service';

function makeService(db: Partial<DrizzleDb>, audit: Partial<AuditLogService> = {}) {
  const auditLog = { record: jest.fn(), ...audit } as unknown as AuditLogService;
  const service = new BettingConfigService(db as DrizzleDb, auditLog);
  return { service, auditLog };
}

describe('BettingConfigService', () => {
  describe('upsert', () => {
    it('inserts a new config when none exists and audits the creation', async () => {
      const select = jest.fn().mockReturnValue(chainable([]));
      const insertChain = chainable([
        {
          id: 'cfg-1',
          instrumentId: 'inst-1',
          betType: 'rise_fall',
          minStake: 100n,
          maxStake: 10_000n,
          payoutRateBasisPoints: 8_500n,
          maxExposure: null,
          minDurationSeconds: 30n,
          maxDurationSeconds: 3_600n,
          isEnabled: true,
        },
      ]);
      const insert = jest.fn().mockReturnValue(insertChain);
      const { service, auditLog } = makeService({ select, insert });

      const result = await service.upsert({
        instrumentId: 'inst-1',
        betType: 'rise_fall',
        minStake: 100n,
        maxStake: 10_000n,
        payoutRateBasisPoints: 8_500n,
        minDurationSeconds: 30n,
        maxDurationSeconds: 3_600n,
        actorUserId: 'admin-1',
      });

      expect(result.id).toBe('cfg-1');
      expect(insertChain.values).toHaveBeenCalledWith(expect.objectContaining({ instrumentId: 'inst-1' }));
      expect(auditLog.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'betting_config.created' }));
    });

    it('updates an existing config in place and audits before/after, never touching bets', async () => {
      const existingRow = {
        id: 'cfg-1',
        instrumentId: 'inst-1',
        betType: 'rise_fall',
        minStake: 100n,
        maxStake: 10_000n,
        payoutRateBasisPoints: 8_000n,
        maxExposure: null,
        minDurationSeconds: 30n,
        maxDurationSeconds: 3_600n,
        isEnabled: true,
      };
      const select = jest.fn().mockReturnValue(chainable([existingRow]));
      const updateChain = chainable([{ ...existingRow, payoutRateBasisPoints: 9_000n }]);
      const update = jest.fn().mockReturnValue(updateChain);
      const { service, auditLog } = makeService({ select, update });

      const result = await service.upsert({
        instrumentId: 'inst-1',
        betType: 'rise_fall',
        minStake: 100n,
        maxStake: 10_000n,
        payoutRateBasisPoints: 9_000n,
        minDurationSeconds: 30n,
        maxDurationSeconds: 3_600n,
        actorUserId: 'admin-1',
      });

      expect(result.payoutRateBasisPoints).toBe(9_000n);
      expect(auditLog.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'betting_config.updated',
          before: expect.objectContaining({ payoutRateBasisPoints: '8000' }),
          after: expect.objectContaining({ payoutRateBasisPoints: '9000' }),
        }),
      );
    });
  });

  describe('getCurrentExposure', () => {
    it('sums open/pending stake for the (instrument, betType) pair', async () => {
      const select = jest.fn().mockReturnValue(chainable([{ total: '1500' }]));
      const { service } = makeService({ select });

      const exposure = await service.getCurrentExposure('inst-1', 'rise_fall');
      expect(exposure).toBe(1500n);
    });

    it('returns zero when there are no open bets', async () => {
      const select = jest.fn().mockReturnValue(chainable([{ total: '0' }]));
      const { service } = makeService({ select });

      expect(await service.getCurrentExposure('inst-1', 'rise_fall')).toBe(0n);
    });
  });
});
