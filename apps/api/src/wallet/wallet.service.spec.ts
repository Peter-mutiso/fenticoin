import { NotFoundException } from '@nestjs/common';

import type { DrizzleDb } from '../database/database.types';
import { chainable } from '../test-utils/mock-drizzle';
import { WalletService } from './wallet.service';

describe('WalletService', () => {
  it('rejects an unsupported currency', async () => {
    const db = { select: jest.fn() } as unknown as DrizzleDb;
    const service = new WalletService(db);
    await expect(service.getBalance('user-1', 'XYZ')).rejects.toThrow('Unsupported currency');
  });

  it('creates a wallet and both ledger accounts when none exist yet, then reads balances via Money', async () => {
    const select = jest
      .fn()
      .mockReturnValueOnce(chainable([])) // wallet lookup: none
      .mockReturnValueOnce(chainable([])) // available account lookup: none
      .mockReturnValueOnce(chainable([])); // locked account lookup: none
    const insert = jest
      .fn()
      .mockReturnValueOnce(chainable([{ id: 'wallet-1', userId: 'user-1', currency: 'USD' }]))
      .mockReturnValueOnce(chainable([{ id: 'available-1', kind: 'available', balance: 0n, currency: 'USD' }]))
      .mockReturnValueOnce(chainable([{ id: 'locked-1', kind: 'locked', balance: 0n, currency: 'USD' }]));

    const db = { select, insert } as unknown as DrizzleDb;
    const service = new WalletService(db);

    const balance = await service.getBalance('user-1', 'USD');
    expect(balance.available.toDecimalString()).toBe('0.00');
    expect(balance.locked.toDecimalString()).toBe('0.00');
    expect(insert).toHaveBeenCalledTimes(3);
  });

  it('reuses an existing wallet and accounts without inserting', async () => {
    const select = jest
      .fn()
      .mockReturnValueOnce(chainable([{ id: 'wallet-1', userId: 'user-1', currency: 'USD' }]))
      .mockReturnValueOnce(chainable([{ id: 'available-1', kind: 'available', balance: 500n, currency: 'USD' }]))
      .mockReturnValueOnce(chainable([{ id: 'locked-1', kind: 'locked', balance: 200n, currency: 'USD' }]));
    const insert = jest.fn();

    const db = { select, insert } as unknown as DrizzleDb;
    const service = new WalletService(db);

    const balance = await service.getBalance('user-1', 'USD');
    expect(balance.available.toDecimalString()).toBe('5.00');
    expect(balance.locked.toDecimalString()).toBe('2.00');
    expect(insert).not.toHaveBeenCalled();
  });

  it('throws NotFoundException when a system account has not been provisioned', async () => {
    const select = jest.fn().mockReturnValue(chainable([]));
    const db = { select } as unknown as DrizzleDb;
    const service = new WalletService(db);

    await expect(service.getSystemAccount(db, 'house_cash', 'USD')).rejects.toThrow(NotFoundException);
  });
});
