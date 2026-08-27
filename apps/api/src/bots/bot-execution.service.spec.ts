import { BotExecutionService } from './bot-execution.service';

describe('BotExecutionService', () => {
  const bot = {
    id: 'bot-1',
    userId: 'user-1',
    status: 'active',
    strategyKey: 'future',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    executionIntervalSeconds: 45,
  } as never;

  function chainResolving(value: unknown) {
    return { from: jest.fn().mockReturnValue({ where: jest.fn().mockReturnValue({ limit: jest.fn().mockResolvedValue(value) }) }) };
  }

  function makeService(strategy: object | undefined, existingBetForKey: unknown[] = [], existingLogForBet: unknown[] = []) {
    const selectMock = jest
      .fn()
      .mockReturnValueOnce(chainResolving([bot]))
      .mockReturnValueOnce(chainResolving(existingBetForKey))
      .mockReturnValueOnce(chainResolving(existingLogForBet));
    const db = { select: selectMock, insert: jest.fn().mockReturnValue({ values: jest.fn().mockResolvedValue(undefined) }) };
    const bettingService = { placeBet: jest.fn().mockResolvedValue({ id: 'bet-1' }) };
    const auditLog = { record: jest.fn() };
    const service = new BotExecutionService(db as never, bettingService as never, auditLog as never, strategy ? [strategy as never] : []);
    return { service, db, bettingService, auditLog };
  }

  const signal = {
    instrumentId: 'instrument-1',
    type: 'rise_fall',
    selection: 'rise',
    stakeAmount: 100n,
    currency: 'USD',
    durationSeconds: 30,
    dedupeKey: 'dca:5',
  };

  it('does not trade when no strategy is configured', async () => {
    const h = makeService(undefined);
    expect(await h.service.execute('bot-1')).toBe(false);
    expect(h.bettingService.placeBet).not.toHaveBeenCalled();
  });

  it('does not write a log row when the strategy returns no signal (avoids per-tick log spam)', async () => {
    const strategy = { key: 'future', evaluate: jest.fn().mockResolvedValue(null) };
    const h = makeService(strategy);
    expect(await h.service.execute('bot-1')).toBe(false);
    expect(h.db.insert).not.toHaveBeenCalled();
  });

  it('executes strategy signals through BettingService with a deterministic, dedupe-based idempotency key', async () => {
    const strategy = { key: 'future', evaluate: jest.fn().mockResolvedValue(signal) };
    const h = makeService(strategy);
    const now = new Date('2026-01-01T00:00:00.000Z');

    expect(await h.service.execute('bot-1', now)).toBe(true);
    expect(h.bettingService.placeBet).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1', botId: 'bot-1', idempotencyKey: 'bot:bot-1:dca:5' }),
    );
    expect(h.auditLog.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'bot.bet_placed', targetId: 'bot-1' }));
    expect(h.db.insert).toHaveBeenCalled();
  });

  it("passes the bot's own configured executionIntervalSeconds into the strategy context — the scheduler honors whatever interval the bot was created with", async () => {
    const strategy = { key: 'future', evaluate: jest.fn().mockResolvedValue(signal) };
    const h = makeService(strategy);
    const now = new Date('2026-01-01T00:00:00.000Z');

    await h.service.execute('bot-1', now);

    expect(strategy.evaluate).toHaveBeenCalledWith(expect.objectContaining({ executionIntervalSeconds: 45 }));
  });

  it('never calls placeBet twice for the same schedule slot — the pre-check finds the already-placed bet', async () => {
    const strategy = { key: 'future', evaluate: jest.fn().mockResolvedValue(signal) };
    const h = makeService(strategy, [{ id: 'bet-existing' }]);
    expect(await h.service.execute('bot-1')).toBe(false);
    expect(h.bettingService.placeBet).not.toHaveBeenCalled();
  });

  it('never writes a second "Placed" log for a bet that placeBet returned as an idempotent replay (an overlapping evaluation racing the pre-check)', async () => {
    const strategy = { key: 'future', evaluate: jest.fn().mockResolvedValue(signal) };
    // The pre-check (by idempotencyKey) found nothing, so we proceed to placeBet — but
    // placeBet itself returns a bet that another, concurrent execute() already logged.
    const h = makeService(strategy, [], [{ id: 'log-existing' }]);

    expect(await h.service.execute('bot-1')).toBe(true);
    expect(h.bettingService.placeBet).toHaveBeenCalled();
    expect(h.db.insert).not.toHaveBeenCalled(); // no new log row, no duplicate audit entry
    expect(h.auditLog.record).not.toHaveBeenCalled();
  });

  it('logs an error and does not throw when placeBet fails', async () => {
    const strategy = { key: 'future', evaluate: jest.fn().mockResolvedValue(signal) };
    const h = makeService(strategy);
    h.bettingService.placeBet.mockRejectedValue(new Error('insufficient funds'));

    await expect(h.service.execute('bot-1')).resolves.toBe(false);
    expect(h.db.insert).toHaveBeenCalled();
  });

  it('logs an error and does not throw when strategy evaluation itself fails', async () => {
    const strategy = { key: 'future', evaluate: jest.fn().mockRejectedValue(new Error('bad config')) };
    const h = makeService(strategy);

    await expect(h.service.execute('bot-1')).resolves.toBe(false);
    expect(h.db.insert).toHaveBeenCalled();
  });
});
