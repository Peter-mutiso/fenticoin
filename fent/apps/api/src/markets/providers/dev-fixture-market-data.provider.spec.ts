import { DevFixtureMarketDataProvider } from './dev-fixture-market-data.provider';

describe('DevFixtureMarketDataProvider', () => {
  it('is always "configured" (it never needs credentials)', () => {
    expect(new DevFixtureMarketDataProvider().isConfigured()).toBe(true);
  });

  it('returns a plausible positive decimal quote for each requested instrument', async () => {
    const provider = new DevFixtureMarketDataProvider();
    const quotes = await provider.getQuotes([
      { providerSymbol: 'bitcoin', quoteCurrency: 'USD' },
      { providerSymbol: 'ethereum', quoteCurrency: 'USD' },
    ]);

    expect(quotes).toHaveLength(2);
    for (const quote of quotes) {
      expect(Number(quote.priceDecimal)).toBeGreaterThan(0);
      expect(quote.observedAt).toBeInstanceOf(Date);
    }
  });

  it('walks the price on each successive call rather than returning a fixed constant', async () => {
    const provider = new DevFixtureMarketDataProvider();
    const [first] = await provider.getQuotes([{ providerSymbol: 'bitcoin', quoteCurrency: 'USD' }]);
    const [second] = await provider.getQuotes([{ providerSymbol: 'bitcoin', quoteCurrency: 'USD' }]);

    expect(first?.priceDecimal).not.toBe(second?.priceDecimal);
  });

  it('falls back to a default base price for an unknown symbol', async () => {
    const provider = new DevFixtureMarketDataProvider();
    const [quote] = await provider.getQuotes([{ providerSymbol: 'some-unlisted-coin', quoteCurrency: 'USD' }]);
    expect(Number(quote?.priceDecimal)).toBeCloseTo(100, 0);
  });
});
