import { ConflictException } from '@nestjs/common';

import { BotService } from './bot.service';

describe('BotService', () => {
  function harness(existing?: object) {
    const db = {
      select: jest.fn().mockReturnValue({ from: jest.fn().mockReturnValue({ where: jest.fn().mockReturnValue({ limit: jest.fn().mockResolvedValue(existing ? [existing] : []) }) }) }),
      insert: jest.fn().mockReturnValue({ values: jest.fn().mockReturnValue({ returning: jest.fn().mockResolvedValue([{ id: 'bot-1', userId: 'user-1', status: 'strategy_unconfigured', strategyKey: null }]) }) }),
      update: jest.fn().mockReturnValue({ set: jest.fn().mockReturnValue({ where: jest.fn().mockReturnValue({ returning: jest.fn().mockResolvedValue([{ id: 'bot-1', userId: 'user-1', status: 'active', strategyKey: 'future' }]) }) }) }),
    };
    return { db, audit: { record: jest.fn() }, service: new BotService(db as never, { record: jest.fn() } as never) };
  }

  it('creates a durable strategy-unconfigured bot', async () => {
    const h = harness();
    const bot = await h.service.getOrCreate('user-1');
    expect(bot.status).toBe('strategy_unconfigured');
    expect(h.db.insert).toHaveBeenCalled();
  });

  it('refuses activation until a strategy is configured', async () => {
    const h = harness({ id: 'bot-1', userId: 'user-1', status: 'strategy_unconfigured', strategyKey: null });
    await expect(h.service.setActive('user-1', true)).rejects.toThrow(ConflictException);
  });

  it('activates and deactivates only the authenticated owner bot', async () => {
    const h = harness({ id: 'bot-1', userId: 'user-1', status: 'inactive', strategyKey: 'future' });
    expect((await h.service.setActive('user-1', true)).status).toBe('active');
    expect((await h.service.setActive('user-1', false)).status).toBe('active');
  });
});