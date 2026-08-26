import { RecurringStrategy } from './recurring.strategy';

describe('RecurringStrategy', () => {
  const strategy = new RecurringStrategy();
  const createdAt = new Date('2026-01-01T00:00:00.000Z');
  const config = {
    instrumentId: 'inst-1',
    selection: 'rise' as const,
    stakeAmount: '500',
    currency: 'USD',
    intervalUnit: 'daily' as const,
    durationSeconds: 60,
  };

  it('returns null when required config is missing', async () => {
    const bot = { createdAt, config: {} } as never;
    expect(await strategy.evaluate({ bot, now: createdAt })).toBeNull();
  });

  it('produces the configured signal deterministically at activation time', async () => {
    const bot = { createdAt, config } as never;
    const signal = await strategy.evaluate({ bot, now: createdAt });
    expect(signal).toMatchObject({ instrumentId: 'inst-1', type: 'rise_fall', selection: 'rise', currency: 'USD', dedupeKey: 'dca:0' });
    expect(signal?.stakeAmount).toBe(500n);
  });

  it('advances the dedupe bucket once a full interval has elapsed, and stays stable within it', async () => {
    const bot = { createdAt, config } as never;
    const midDay = new Date(createdAt.getTime() + 12 * 60 * 60 * 1000);
    const nextDay = new Date(createdAt.getTime() + 25 * 60 * 60 * 1000);

    const first = await strategy.evaluate({ bot, now: createdAt });
    const stillFirstBucket = await strategy.evaluate({ bot, now: midDay });
    const secondBucket = await strategy.evaluate({ bot, now: nextDay });

    expect(first?.dedupeKey).toBe('dca:0');
    expect(stillFirstBucket?.dedupeKey).toBe('dca:0');
    expect(secondBucket?.dedupeKey).toBe('dca:1');
  });
});
