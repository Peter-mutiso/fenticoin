
import { Injectable } from '@nestjs/common';

import { AppConfigService } from '../../config/app-config.service';
import type {
  MarketDataProvider,
  MarketDataQuote,
  MarketDataQuoteRequest,
} from './market-data-provider.interface';

const COINBASE_TICKER_ENDPOINT =
  'https://api.exchange.coinbase.com/products';

interface CoinbaseTickerResponse {
  ask?: string;
  bid?: string;
  price?: string;
  size?: string;
  time?: string;
  trade_id?: number;
  volume?: string;
}

/**
 * Maps the provider symbols used by the instrument catalog to Coinbase
 * base asset symbols.
 *
 * Instruments may also provide an explicit Coinbase product such as
 * "BTC-USD". In that case the providerSymbol is used directly.
 */
const PROVIDER_SYMBOL_MAP: Record<string, string> = {
  bitcoin: 'BTC',
  ethereum: 'ETH',
  xrp: 'XRP',
  solana: 'SOL',
  cardano: 'ADA',
  dogecoin: 'DOGE',
  polygon: 'POL',
  avalanche: 'AVAX',
  chainlink: 'LINK',
  litecoin: 'LTC',
  bitcoin_cash: 'BCH',
};

@Injectable()
export class CoinbaseMarketDataProvider implements MarketDataProvider {
  readonly name = 'Coinbase';

  constructor(private readonly config: AppConfigService) {}

  isConfigured(): boolean {
    // Coinbase Exchange's public ticker endpoint does not require an API key.
    return true;
  }

  async getQuotes(
    requests: MarketDataQuoteRequest[],
  ): Promise<MarketDataQuote[]> {
    if (requests.length === 0) {
      return [];
    }

    const quotes: MarketDataQuote[] = [];

    for (const request of requests) {
      const productId = this.toCoinbaseProductId(
        request.providerSymbol,
        request.quoteCurrency,
      );

      try {
        const quote = await this.fetchTicker(productId);

        if (!quote) {
          continue;
        }

        quotes.push({
          providerSymbol: request.providerSymbol,
          quoteCurrency: request.quoteCurrency,
          priceDecimal: quote.price,
          observedAt: quote.observedAt,
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : String(error);

        console.warn(
          `[Coinbase] Quote failed instrument=${request.providerSymbol}/${request.quoteCurrency} product=${productId} error=${message}`,
        );
      }
    }

    return quotes;
  }

  private async fetchTicker(
    productId: string,
  ): Promise<
    | {
        price: string;
        observedAt: Date;
      }
    | undefined
  > {
    const url = `${COINBASE_TICKER_ENDPOINT}/${encodeURIComponent(
      productId,
    )}/ticker`;

    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(
        `Coinbase request failed with status ${response.status}`,
      );
    }

    const body = (await response.json()) as CoinbaseTickerResponse;

    if (typeof body.price !== 'string' || body.price.trim().length === 0) {
      throw new Error(`Coinbase returned no price for ${productId}`);
    }

    if (typeof body.time !== 'string' || body.time.trim().length === 0) {
      throw new Error(
        `Coinbase returned no observation timestamp for ${productId}`,
      );
    }

    const observedAt = new Date(body.time);

    if (Number.isNaN(observedAt.getTime())) {
      throw new Error(
        `Coinbase returned an invalid observation timestamp for ${productId}`,
      );
    }

    const price = body.price.trim();

    // Keep the price as a decimal string.
    // Do not convert it through Number().
    if (!/^\d+(?:\.\d+)?$/.test(price)) {
      throw new Error(
        `Coinbase returned an invalid decimal price for ${productId}: ${price}`,
      );
    }

    return {
      price,
      observedAt,
    };
  }

  private toCoinbaseProductId(
    providerSymbol: string,
    quoteCurrency: string,
  ): string {
    const normalizedSymbol = providerSymbol.trim().toLowerCase();
    const normalizedCurrency = quoteCurrency.trim().toUpperCase();

    /*
     * Allow the instrument catalog to explicitly specify a Coinbase
     * product such as BTC-USD.
     */
    if (providerSymbol.includes('-')) {
      return providerSymbol.toUpperCase();
    }

    const baseSymbol =
      PROVIDER_SYMBOL_MAP[normalizedSymbol] ??
      normalizedSymbol.toUpperCase();

    return `${baseSymbol}-${normalizedCurrency}`;
  }
}
