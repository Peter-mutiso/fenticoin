import { BotExecutionService } from './bot-execution.service';

describe('BotExecutionService', () => {
  const bot = { id: 'bot-1', userId: 'user-1', status: 'active', strategyKey: 'future' } as never;

  function makeService(strategy: object | undefined) {
    const db = {
      select: jest.fn().mockReturnValue({ from: jest.fn().mockReturnValue({ where: jest.fn().mockReturnValue({ limit: jest.fn().mockResolvedValue([bot]) }) }) }),
    };
    const bettingService = { placeBet: jest.fn().mockResolvedValue({ id: 'bet-1' }) };
    const auditLog = { record: jest.fn() };
    const service = new BotExecutionService(db as never, bettingService as never, auditLog as never, strategy ? [strategy as never] : []);
    return { service, bettingService, auditLog };
  }

  it('does not trade when no strategy is configured', async () => {
    const h = makeService(undefined);
    expect(await h.service.execute('bot-1')).toBe(false);
    expect(h.bettingService.placeBet).not.toHaveBeenCalled();
  });

  it('executes strategy signals through BettingService with deterministic idempotency', async () => {
    const strategy = { key: 'future', evaluate: jest.fn().mockResolvedValue({ instrumentId: 'instrument-1', type: 'rise_fall', selection: 'rise', stakeAmount: 100n, currency: 'USD', durationSeconds: 30 }) };
    const h = makeService(strategy);
    const now = new Date('2026-01-01T00:00:00.000Z');

    expect(await h.service.execute('bot-1', now)).toBe(true);
    expect(h.bettingService.placeBet).toHaveBeenCalledWith(expect.objectContaining({ userId: 'user-1', idempotencyKey: 'bot:bot-1:2026-01-01T00:00:00.000Z' }));
    expect(h.auditLog.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'bot.bet_placed', targetId: 'bot-1' }));
  });
});