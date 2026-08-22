import { ConflictException, NotFoundException } from '@nestjs/common';

import type { AuditLogService } from '../audit/audit-log.service';
import type { DrizzleDb } from '../database/database.types';
import { chainable } from '../test-utils/mock-drizzle';
import { InstrumentService } from './instrument.service';

function makeService(db: Partial<DrizzleDb>, audit: Partial<AuditLogService> = {}) {
  const auditLog = { record: jest.fn(), ...audit } as unknown as AuditLogService;
  const events = { emit: jest.fn() } as unknown as import('@nestjs/event-emitter').EventEmitter2;
  const service = new InstrumentService(db as DrizzleDb, auditLog, events);
  return { service, auditLog, events };
}

describe('InstrumentService', () => {
  describe('create', () => {
    it('rejects an unsupported quote currency', async () => {
      const { service } = makeService({});
      await expect(
        service.create({
          symbol: 'BTC',
          quoteCurrency: 'ZZZ',
          name: 'Bitcoin',
          categoryKey: 'crypto',
          createdBy: 'admin-1',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('rejects a duplicate symbol/quoteCurrency pair', async () => {
      const select = jest.fn().mockReturnValue(chainable([{ id: 'existing' }]));
      const { service } = makeService({ select });

      await expect(
        service.create({ symbol: 'BTC', quoteCurrency: 'USD', name: 'Bitcoin', categoryKey: 'crypto', createdBy: 'admin-1' }),
      ).rejects.toThrow('already exists');
    });

    it('creates an instrument, uppercasing symbol/currency and building the display symbol', async () => {
      const select = jest.fn().mockReturnValue(chainable([]));
      const insertedRow = { id: 'inst-1', symbol: 'BTC', quoteCurrency: 'USD', displaySymbol: 'BTC/USD' };
      const insertChain = chainable([insertedRow]);
      const insert = jest.fn().mockReturnValue(insertChain);
      const { service, auditLog } = makeService({ select, insert });

      const result = await service.create({
        symbol: 'btc',
        quoteCurrency: 'usd',
        name: 'Bitcoin',
        categoryKey: 'crypto',
        createdBy: 'admin-1',
      });

      expect(result).toBe(insertedRow);
      expect(insertChain.values).toHaveBeenCalledWith(
        expect.objectContaining({ symbol: 'BTC', quoteCurrency: 'USD', displaySymbol: 'BTC/USD', pricePrecision: 2 }),
      );
      expect(auditLog.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'instrument.created' }));
    });
  });

  describe('getById', () => {
    it('throws NotFoundException when missing', async () => {
      const select = jest.fn().mockReturnValue(chainable([]));
      const { service } = makeService({ select });
      await expect(service.getById('missing')).rejects.toThrow(NotFoundException);
    });
  });

  describe('setStatus', () => {
    it('updates status and records an audit entry with before/after', async () => {
      const select = jest.fn().mockReturnValue(chainable([{ id: 'inst-1', status: 'active' }]));
      const update = jest.fn().mockReturnValue(chainable([{ id: 'inst-1', status: 'suspended', updatedAt: new Date() }]));
      const { service, auditLog } = makeService({ select, update });

      const result = await service.setStatus({
        instrumentId: 'inst-1',
        status: 'suspended',
        actorUserId: 'admin-1',
        reason: 'price feed unreliable',
      });

      expect(result.status).toBe('suspended');
      expect(auditLog.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'instrument.status_changed',
          before: { status: 'active' },
          after: { status: 'suspended', reason: 'price feed unreliable' },
        }),
      );
    });
  });
});
