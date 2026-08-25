import type { DrizzleDb } from '../database/database.types';
import { chainable } from '../test-utils/mock-drizzle';
import { ReconciliationService } from './reconciliation.service';

describe('ReconciliationService', () => {
  it('reports no drift when the cached balance matches the entries for a credit-normal (user) account', async () => {
    const select = jest
      .fn()
      .mockReturnValueOnce(chainable([{ id: 'acct-1', systemKey: null, balance: 400n }]))
      .mockReturnValueOnce(chainable([{ debitTotal: '100', creditTotal: '500' }]));
    const insert = jest.fn().mockReturnValue(chainable(undefined));
    const db = { select, insert } as unknown as DrizzleDb;
    const service = new ReconciliationService(db);

    const result = await service.reconcileAccount('acct-1');

    expect(result.computedBalance).toBe(400n); // 500 credit - 100 debit
    expect(result.isDrifted).toBe(false);
    expect(insert).toHaveBeenCalled();
  });

  it('reports no drift for a debit-normal (house_cash) account', async () => {
    const select = jest
      .fn()
      .mockReturnValueOnce(chainable([{ id: 'house-cash', systemKey: 'house_cash', balance: 900n }]))
      .mockReturnValueOnce(chainable([{ debitTotal: '1000', creditTotal: '100' }]));
    const insert = jest.fn().mockReturnValue(chainable(undefined));
    const db = { select, insert } as unknown as DrizzleDb;
    const service = new ReconciliationService(db);

    const result = await service.reconcileAccount('house-cash');
    expect(result.computedBalance).toBe(900n); // 1000 debit - 100 credit
    expect(result.isDrifted).toBe(false);
  });

  it('flags drift when the cached balance disagrees with the computed sum', async () => {
    const select = jest
      .fn()
      .mockReturnValueOnce(chainable([{ id: 'acct-1', systemKey: null, balance: 999n }]))
      .mockReturnValueOnce(chainable([{ debitTotal: '0', creditTotal: '400' }]));
    const insert = jest.fn().mockReturnValue(chainable(undefined));
    const db = { select, insert } as unknown as DrizzleDb;
    const service = new ReconciliationService(db);

    const result = await service.reconcileAccount('acct-1');
    expect(result.computedBalance).toBe(400n);
    expect(result.driftAmount).toBe(599n);
    expect(result.isDrifted).toBe(true);
  });

  it('throws when the account does not exist', async () => {
    const select = jest.fn().mockReturnValueOnce(chainable([]));
    const db = { select } as unknown as DrizzleDb;
    const service = new ReconciliationService(db);

    await expect(service.reconcileAccount('missing')).rejects.toThrow('not found');
  });
});
