import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';

import { BotService } from './bot.service';

const BOT_ROW = { id: 'bot-1', userId: 'user-1', name: 'My bot', status: 'inactive', strategyKey: 'dca_recurring', config: {} };

describe('BotService', () => {
  function harness(options: { existingBot?: object | null; instrument?: object } = {}) {
    const existing = options.existingBot === undefined ? BOT_ROW : options.existingBot;
    const db = {
      select: jest.fn().mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue(existing ? [existing] : []),
            orderBy: jest.fn().mockReturnValue({ limit: jest.fn().mockResolvedValue([]) }),
            groupBy: jest.fn().mockResolvedValue([]),
          }),
          orderBy: jest.fn().mockResolvedValue(existing ? [existing] : []),
        }),
      }),
      insert: jest.fn().mockReturnValue({
        values: jest.fn().mockReturnValue({ returning: jest.fn().mockResolvedValue([{ ...BOT_ROW, id: 'bot-new' }]) }),
      }),
      update: jest.fn().mockReturnValue({
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({ returning: jest.fn().mockResolvedValue([{ ...BOT_ROW, status: 'active' }]) }),
        }),
      }),
    };
    const auditLog = { record: jest.fn() };
    const instrumentService = {
      getById: jest.fn().mockResolvedValue(options.instrument ?? { id: 'inst-1', status: 'active', quoteCurrency: 'USD' }),
    };
    return { db, auditLog, instrumentService, service: new BotService(db as never, auditLog as never, instrumentService as never) };
  }

  const validConfig = {
    instrumentId: 'inst-1',
    selection: 'rise',
    stakeAmount: '100',
    currency: 'USD',
    intervalUnit: 'daily',
    durationSeconds: 60,
  };

  it('rejects an unknown strategy', async () => {
    const h = harness();
    await expect(h.service.create('user-1', { name: 'Bot', strategyKey: 'not_real', config: {} })).rejects.toThrow(BadRequestException);
  });

  it('rejects the coming-soon grid strategy', async () => {
    const h = harness();
    await expect(h.service.create('user-1', { name: 'Bot', strategyKey: 'grid_trading', config: {} })).rejects.toThrow(BadRequestException);
  });

  it('creates a bot in the inactive state', async () => {
    const h = harness();
    const bot = await h.service.create('user-1', { name: 'BTC weekly', strategyKey: 'dca_recurring', config: validConfig });
    expect(h.db.insert).toHaveBeenCalled();
    expect(bot.id).toBe('bot-new');
  });

  it('rejects creation against a non-tradable instrument', async () => {
    const h = harness({ instrument: { id: 'inst-1', status: 'suspended', quoteCurrency: 'USD' } });
    await expect(h.service.create('user-1', { name: 'Bot', strategyKey: 'dca_recurring', config: validConfig })).rejects.toThrow(BadRequestException);
  });

  it('rejects creation when currency does not match the instrument quote currency', async () => {
    const h = harness({ instrument: { id: 'inst-1', status: 'active', quoteCurrency: 'EUR' } });
    await expect(h.service.create('user-1', { name: 'Bot', strategyKey: 'dca_recurring', config: validConfig })).rejects.toThrow(BadRequestException);
  });

  it('refuses activation until a strategy is configured', async () => {
    const h = harness({ existingBot: { ...BOT_ROW, strategyKey: null } });
    await expect(h.service.setActive('user-1', 'bot-1', true)).rejects.toThrow(ConflictException);
  });

  it('activates only the authenticated owner bot', async () => {
    const h = harness();
    const bot = await h.service.setActive('user-1', 'bot-1', true);
    expect(bot.status).toBe('active');
  });

  it('throws NotFoundException for a bot the user does not own', async () => {
    const h = harness({ existingBot: null });
    await expect(h.service.setActive('user-1', 'bot-1', true)).rejects.toThrow(NotFoundException);
  });

  it('refuses to update config while the bot is active', async () => {
    const h = harness({ existingBot: { ...BOT_ROW, status: 'active' } });
    await expect(h.service.update('user-1', 'bot-1', { config: validConfig })).rejects.toThrow(ConflictException);
  });

  it('persists a caller-supplied executionIntervalSeconds on create', async () => {
    const h = harness();
    await h.service.create('user-1', { name: 'BTC weekly', strategyKey: 'dca_recurring', config: validConfig, executionIntervalSeconds: 30 });
    const [values] = h.db.insert.mock.results[0]!.value.values.mock.calls[0] as [Record<string, unknown>];
    expect(values.executionIntervalSeconds).toBe(30);
  });

  it('defaults executionIntervalSeconds to 300 seconds when the caller omits it', async () => {
    const h = harness();
    await h.service.create('user-1', { name: 'BTC weekly', strategyKey: 'dca_recurring', config: validConfig });
    const [values] = h.db.insert.mock.results[0]!.value.values.mock.calls[0] as [Record<string, unknown>];
    expect(values.executionIntervalSeconds).toBe(300);
  });

  it('allows updating executionIntervalSeconds while the bot is inactive', async () => {
    const h = harness();
    await h.service.update('user-1', 'bot-1', { executionIntervalSeconds: 3600 });
    const [updates] = h.db.update.mock.results[0]!.value.set.mock.calls[0] as [Record<string, unknown>];
    expect(updates.executionIntervalSeconds).toBe(3600);
  });
});
