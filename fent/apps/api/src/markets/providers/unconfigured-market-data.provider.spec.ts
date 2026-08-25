import { UnconfiguredMarketDataProvider } from './unconfigured-market-data.provider';

describe('UnconfiguredMarketDataProvider', () => {
  it('reports itself as not configured', () => {
    expect(new UnconfiguredMarketDataProvider().isConfigured()).toBe(false);
  });

  it('always throws rather than returning any price', async () => {
    const provider = new UnconfiguredMarketDataProvider();
    await expect(provider.getQuotes()).rejects.toThrow('not configured');
  });
});
