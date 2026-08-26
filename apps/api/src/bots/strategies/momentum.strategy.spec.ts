import { MomentumStrategy } from './momentum.strategy';

function makeDb(pricesNewestFirst: number[]) {
  return {
    select: jest.fn().mockReturnValue({
      from: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnValue({
          orderBy: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue(pricesNewestFirst.map((price) => ({ price: BigInt(price) }))),
          }),
        }),
      }),
    }),
  };
}

describe('MomentumStrategy', () => {
  const now = new Date('2026-01-01T00:00:00.000Z');
  const baseConfig = {
    instrumentId: 'inst-1',
    stakeAmount: '250',
    currency: 'USD',
    durationSeconds: 60,
    rsiPeriod: 3,
    oversoldThreshold: 30,
    overboughtThreshold: 70,
    evaluationIntervalSeconds: 60,
  };

  it('returns null when config is incomplete', async () => {
    const strategy = new MomentumStrategy(makeDb([]) as never);
    expect(await strategy.evaluate({ bot: { config: {} } as never, now })).toBeNull();
  });

  it('returns null when there is not enough real price history yet — never fabricates a signal', async () => {
    const strategy = new MomentumStrategy(makeDb([100, 90]) as never);
    const bot = { config: baseConfig } as never;
    expect(await strategy.evaluate({ bot, now })).toBeNull();
  });

  it('signals rise from a real, deeply oversold RSI computed from actual price history', async () => {
    // Chronological prices 100 -> 90 -> 80 -> 70 (a steady real decline) => RSI 0.
    const strategy = new MomentumStrategy(makeDb([70, 80, 90, 100]) as never);
    const bot = { config: baseConfig } as never;
    const signal = await strategy.evaluate({ bot, now });
    expect(signal).toMatchObject({ selection: 'rise', instrumentId: 'inst-1' });
    expect(signal?.dedupeKey).toBe(`momentum:${Math.floor(now.getTime() / 1000 / baseConfig.evaluationIntervalSeconds)}`);
  });

  it('signals fall from a real, deeply overbought RSI computed from actual price history', async () => {
    // Chronological prices 70 -> 80 -> 90 -> 100 (a steady real rise) => RSI 100.
    const strategy = new MomentumStrategy(makeDb([100, 90, 80, 70]) as never);
    const bot = { config: baseConfig } as never;
    const signal = await strategy.evaluate({ bot, now });
    expect(signal?.selection).toBe('fall');
  });

  it('returns null (no trade) when RSI sits neutrally between both thresholds', async () => {
    // Chronological 100 -> 110 -> 100: one gain, one loss of equal size => RSI 50.
    const strategy = new MomentumStrategy(makeDb([100, 110, 100]) as never);
    const bot = { config: { ...baseConfig, rsiPeriod: 2 } } as never;
    expect(await strategy.evaluate({ bot, now })).toBeNull();
  });
});
