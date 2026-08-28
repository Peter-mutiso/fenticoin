import { Injectable } from '@nestjs/common';

import { AppConfigService } from '../../config/app-config.service';
import type { MarketDataProvider, MarketDataQuote, MarketDataQuoteRequest } from './market-data-provider.interface';

const SIMPLE_PRICE_ENDPOINT = 'https://api.coingecko.com/api/v3/simple/price';

interface CoinGeckoSimplePriceResponse {
  [coinId: string]: { [currency: string]: number | undefined; last_updated_at?: number } | undefined;
}

/**
 * A real client against CoinGecko's public REST API — not a mock. Its
 * "simple/price" endpoint needs no API key for reasonable request
 * volumes, so this is usable out of the box for crypto instruments
 * whose `providerSymbol` is set to the corresponding CoinGecko coin id
 * (e.g. "bitcoin", "ethereum" — see `database/seed/seed-instruments.ts`).
 *
 * `COINGECKO_API_KEY` is optional and, if set, is sent under the free
 * **Demo**-tier header (`x-cg-demo-api-key`) for a higher rate limit on
 * this same `api.coingecko.com` root — not the paid Pro tier, which is a
 * different header *and* a different base URL (`pro-api.coingecko.com`)
 * this class does not target. Live-verified against the real network: the
 * anonymous rate limit is low enough that refreshing 4 instruments every
 * 10 seconds can 429 without a Demo key configured.
 */
@Injectable()
export class CoinGeckoMarketDataProvider implements MarketDataProvider {
  readonly name = 'CoinGecko';

  constructor(private readonly config: AppConfigService) {}

  isConfigured(): boolean {
    return true; // the public endpoint works without a key; the key only raises rate limits.
  }

  async getQuotes(requests: MarketDataQuoteRequest[]): Promise<MarketDataQuote[]> {
    if (requests.length === 0) return [];

    const ids = [...new Set(requests.map((r) => r.providerSymbol))];
    const currencies = [...new Set(requests.map((r) => r.quoteCurrency.toLowerCase()))];

    const url = new URL(SIMPLE_PRICE_ENDPOINT);
    url.searchParams.set('ids', ids.join(','));
    url.searchParams.set('vs_currencies', currencies.join(','));
    url.searchParams.set('include_last_updated_at', 'true');

    const headers: Record<string, string> = {};
    if (this.config.coinGeckoApiKey) {
      headers['x-cg-demo-api-key'] = this.config.coinGeckoApiKey;
    }

    const response = await fetch(url, { headers });
    if (!response.ok) {
      throw new Error(`CoinGecko request failed with status ${response.status}`);
    }

    const body = (await response.json()) as CoinGeckoSimplePriceResponse;

    const quotes: MarketDataQuote[] = [];
    for (const request of requests) {
      const coin = body[request.providerSymbol];
      const currencyKey = request.quoteCurrency.toLowerCase();
      const price = coin?.[currencyKey];
      if (coin === undefined || price === undefined) continue;

      quotes.push({
        providerSymbol: request.providerSymbol,
        quoteCurrency: request.quoteCurrency,
        priceDecimal: price.toString(),
        observedAt: coin.last_updated_at ? new Date(coin.last_updated_at * 1000) : new Date(),
      });
    }

    return quotes;
  }
}
