import { Injectable, Logger } from '@nestjs/common';

import type { MarketDataProvider, MarketDataQuote, MarketDataQuoteRequest } from './market-data-provider.interface';

/**
 * Simulated prices for LOCAL DEVELOPMENT ONLY — never selected in
 * production (see `providers.module.ts`). Illustrative starting points,
 * not real-world quotes; each call nudges the previous value by a small
 * random percentage so staleness/streaming behavior has something
 * plausible to look at without a real feed.
 */
const FIXTURE_BASE_PRICES: Record<string, number> = {
  bitcoin: 112_000,
  ethereum: 4_500,
  solana: 190,
  ripple: 2.3,
};
const DEFAULT_BASE_PRICE = 100;
const MAX_STEP_PCT = 0.004; // +/- 0.4% per call

@Injectable()
export class DevFixtureMarketDataProvider implements MarketDataProvider {
  readonly name = 'Dev fixture market data (non-production only)';
  private readonly logger = new Logger(DevFixtureMarketDataProvider.name);
  private readonly currentPrices = new Map<string, number>();

  isConfigured(): boolean {
    return true;
  }

  async getQuotes(requests: MarketDataQuoteRequest[]): Promise<MarketDataQuote[]> {
    await Promise.resolve();
    this.logger.warn(`[DEV FIXTURE] Serving simulated prices for ${requests.length} instrument(s) — not real market data`);

    return requests.map((request) => {
      const previous =
        this.currentPrices.get(request.providerSymbol) ?? FIXTURE_BASE_PRICES[request.providerSymbol] ?? DEFAULT_BASE_PRICE;

      const stepPct = (Math.random() * 2 - 1) * MAX_STEP_PCT;
      const next = Math.max(previous * (1 + stepPct), 0.0001);
      this.currentPrices.set(request.providerSymbol, next);

      return {
        providerSymbol: request.providerSymbol,
        quoteCurrency: request.quoteCurrency,
        priceDecimal: next.toFixed(8),
        observedAt: new Date(),
      };
    });
  }
}
