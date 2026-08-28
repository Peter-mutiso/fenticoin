import type { AppConfigService } from '../../config/app-config.service';
import { CoinGeckoMarketDataProvider } from './coingecko-market-data.provider';

describe('CoinGeckoMarketDataProvider', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('is always configured — the public endpoint needs no API key', () => {
    const provider = new CoinGeckoMarketDataProvider({ coinGeckoApiKey: undefined } as AppConfigService);
    expect(provider.isConfigured()).toBe(true);
  });

  it('returns an empty array without calling fetch when there are no requests', async () => {
    const fetchSpy = jest.fn();
    global.fetch = fetchSpy as unknown as typeof fetch;
    const provider = new CoinGeckoMarketDataProvider({ coinGeckoApiKey: undefined } as AppConfigService);

    await expect(provider.getQuotes([])).resolves.toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('parses a successful response into quotes', async () => {
    const fetchSpy = jest.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          bitcoin: { usd: 112503.27, last_updated_at: 1_700_000_000 },
          ethereum: { usd: 4588.81 },
        }),
    });
    global.fetch = fetchSpy as unknown as typeof fetch;

    const provider = new CoinGeckoMarketDataProvider({ coinGeckoApiKey: undefined } as AppConfigService);
    const quotes = await provider.getQuotes([
      { providerSymbol: 'bitcoin', quoteCurrency: 'USD' },
      { providerSymbol: 'ethereum', quoteCurrency: 'USD' },
    ]);

    expect(quotes).toEqual([
      { providerSymbol: 'bitcoin', quoteCurrency: 'USD', priceDecimal: '112503.27', observedAt: new Date(1_700_000_000 * 1000) },
      expect.objectContaining({ providerSymbol: 'ethereum', quoteCurrency: 'USD', priceDecimal: '4588.81' }),
    ]);
  });

  it('omits an instrument entirely if the provider response is missing it', async () => {
    const fetchSpy = jest.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });
    global.fetch = fetchSpy as unknown as typeof fetch;

    const provider = new CoinGeckoMarketDataProvider({ coinGeckoApiKey: undefined } as AppConfigService);
    const quotes = await provider.getQuotes([{ providerSymbol: 'bitcoin', quoteCurrency: 'USD' }]);
    expect(quotes).toEqual([]);
  });

  it('throws on a non-OK HTTP response rather than returning a fabricated price', async () => {
    const fetchSpy = jest.fn().mockResolvedValue({ ok: false, status: 429 });
    global.fetch = fetchSpy as unknown as typeof fetch;

    const provider = new CoinGeckoMarketDataProvider({ coinGeckoApiKey: undefined } as AppConfigService);
    await expect(provider.getQuotes([{ providerSymbol: 'bitcoin', quoteCurrency: 'USD' }])).rejects.toThrow('429');
  });

  it('sends the Demo-tier API key header when one is configured', async () => {
    const fetchSpy = jest.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });
    global.fetch = fetchSpy as unknown as typeof fetch;

    const provider = new CoinGeckoMarketDataProvider({ coinGeckoApiKey: 'secret-key' } as AppConfigService);
    await provider.getQuotes([{ providerSymbol: 'bitcoin', quoteCurrency: 'USD' }]);

    const [, init] = fetchSpy.mock.calls[0] as [URL, { headers: Record<string, string> }];
    expect(init.headers['x-cg-demo-api-key']).toBe('secret-key');
  });
});
