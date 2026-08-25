import { Injectable } from '@nestjs/common';

import { ProviderNotConfiguredError } from '../../auth/providers/provider-not-configured.error';
import type { MarketDataProvider, MarketDataQuote } from './market-data-provider.interface';

/** Selected in production until a real market-data vendor is configured. Never fabricates a price. */
@Injectable()
export class UnconfiguredMarketDataProvider implements MarketDataProvider {
  readonly name = 'Market data (unconfigured)';

  isConfigured(): boolean {
    return false;
  }

  async getQuotes(): Promise<MarketDataQuote[]> {
    await Promise.resolve();
    throw new ProviderNotConfiguredError('Market data provider');
  }
}
