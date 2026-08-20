import { ConflictException } from '@nestjs/common';

import type { DrizzleDb } from '../database/database.types';
import { chainable } from '../test-utils/mock-drizzle';
import { MarketCategoryService } from './market-category.service';

describe('MarketCategoryService', () => {
  it('rejects a duplicate category key', async () => {
    const select = jest.fn().mockReturnValue(chainable([{ key: 'crypto' }]));
    const service = new MarketCategoryService({ select } as unknown as DrizzleDb);

    await expect(service.create({ key: 'crypto', name: 'Crypto' })).rejects.toThrow(ConflictException);
  });

  it('creates a category, lowercasing the key', async () => {
    const select = jest.fn().mockReturnValue(chainable([]));
    const insertedRow = { key: 'crypto', name: 'Crypto' };
    const insertChain = chainable([insertedRow]);
    const insert = jest.fn().mockReturnValue(insertChain);
    const service = new MarketCategoryService({ select, insert } as unknown as DrizzleDb);

    const result = await service.create({ key: 'CRYPTO', name: 'Crypto' });
    expect(result).toBe(insertedRow);
    expect(insertChain.values).toHaveBeenCalledWith(expect.objectContaining({ key: 'crypto' }));
  });
});
