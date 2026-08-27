import { RecurringStrategy } from './recurring.strategy';

describe('RecurringStrategy', () => {
  const strategy = new RecurringStrategy();
  const createdAt = new Date('2026-01-01T00:00:00.000Z');
  const executionIntervalSeconds = 24 * 60 * 60; // daily, expressed via the shared bot-level interval
  const config = {
    instrumentId: 'inst-1',
    selection: 'rise' as const,
    stakeAmount: '500',
    currency: 'USD',
    durationSeconds: 60,
  };

  it('returns null when required config is missing', async () => {
    const bot = { createdAt, config: {} } as never;
    expect(await strategy.evaluate({ bot, now: createdAt, executionIntervalSeconds })).toBeNull();
  });

  it('produces the configured signal deterministically at activation time', async () => {
    const bot = { createdAt, config } as never;
    const signal = await strategy.evaluate({ bot, now: createdAt, executionIntervalSeconds });
    expect(signal).toMatchObject({ instrumentId: 'inst-1', type: 'rise_fall', selection: 'rise', currency: 'USD', dedupeKey: 'dca:0' });
    expect(signal?.stakeAmount).toBe(500n);
  });

  it('advances the dedupe bucket once a full interval has elapsed, and stays stable within it', async () => {
    const bot = { createdAt, config } as never;
    const midDay = new Date(createdAt.getTime() + 12 * 60 * 60 * 1000);
    const nextDay = new Date(createdAt.getTime() + 25 * 60 * 60 * 1000);

    const first = await strategy.evaluate({ bot, now: createdAt, executionIntervalSeconds });
    const stillFirstBucket = await strategy.evaluate({ bot, now: midDay, executionIntervalSeconds });
    const secondBucket = await strategy.evaluate({ bot, now: nextDay, executionIntervalSeconds });

    expect(first?.dedupeKey).toBe('dca:0');
    expect(stillFirstBucket?.dedupeKey).toBe('dca:0');
    expect(secondBucket?.dedupeKey).toBe('dca:1');
  });

  it('honors a short (seconds-scale) execution interval just as deterministically as a daily one', async () => {
    const bot = { createdAt, config } as never;
    const shortInterval = 30; // 30 seconds
    const tenSecondsIn = new Date(createdAt.getTime() + 10_000);
    const fortySecondsIn = new Date(createdAt.getTime() + 40_000);

    const first = await strategy.evaluate({ bot, now: tenSecondsIn, executionIntervalSeconds: shortInterval });
    const second = await strategy.evaluate({ bot, now: fortySecondsIn, executionIntervalSeconds: shortInterval });

    expect(first?.dedupeKey).toBe('dca:0');
    expect(second?.dedupeKey).toBe('dca:1');
  });
});
