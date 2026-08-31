import { Injectable } from '@nestjs/common';

import { AppConfigService } from '../../config/app-config.service';
import type {
  MarketDataProvider,
  MarketDataQuote,
  MarketDataQuoteRequest,
} from './market-data-provider.interface';

const SIMPLE_PRICE_ENDPOINT =
  'https://api.coingecko.com/api/v3/simple/price';

interface CoinGeckoCoinPrice {
  [currency: string]: unknown;
  last_updated_at?: unknown;
}

interface CoinGeckoSimplePriceResponse {
  [coinId: string]: CoinGeckoCoinPrice | undefined;
}

/**
 * Real CoinGecko market-data provider.
 *
 * This provider is intentionally provider-agnostic from the perspective
 * of PriceFeedService. It is responsible only for:
 *
 * 1. Requesting market data from CoinGecko.
 * 2. Validating the response shape.
 * 3. Returning prices as decimal strings.
 * 4. Returning the provider observation timestamp.
 *
 * PriceFeedService is responsible for converting the decimal string into
 * the instrument's exact scaled bigint representation.
 *
 * The public CoinGecko endpoint can work without an API key, but an
 * optional Demo API key may be supplied through COINGECKO_API_KEY.
 *
 * This provider deliberately does not retry 429 responses.
 * PriceFeedService owns rate-limit cooldown and refresh coordination.
 */
@Injectable()
export class CoinGeckoMarketDataProvider implements MarketDataProvider {
  readonly name = 'CoinGecko';

  constructor(private readonly config: AppConfigService) {}

  /**
   * CoinGecko's public endpoint is usable without a key.
   *
   * When a Demo API key is configured, getQuotes() sends it using the
   * x-cg-demo-api-key header.
   */
  isConfigured(): boolean {
    return true;
  }

  /**
   * Fetch prices for one or more CoinGecko coin IDs.
   *
   * Example:
   *
   * requests = [
   *   {
   *     providerSymbol: 'bitcoin',
   *     quoteCurrency: 'USD',
   *   },
   *   {
   *     providerSymbol: 'ethereum',
   *     quoteCurrency: 'USD',
   *   },
   * ]
   *
   * produces ONE HTTP request containing both assets.
   */
  async getQuotes(
    requests: MarketDataQuoteRequest[],
  ): Promise<MarketDataQuote[]> {
    if (requests.length === 0) {
      return [];
    }

    /**
     * Remove duplicate provider symbols and currencies so the request
     * remains as small as possible.
     */
    const ids = [
      ...new Set(
        requests.map((request) => request.providerSymbol),
      ),
    ];

    const currencies = [
      ...new Set(
        requests.map((request) =>
          request.quoteCurrency.toLowerCase(),
        ),
      ),
    ];

    const url = new URL(SIMPLE_PRICE_ENDPOINT);

    url.searchParams.set('ids', ids.join(','));
    url.searchParams.set('vs_currencies', currencies.join(','));
    url.searchParams.set('include_last_updated_at', 'true');

    /**
     * Only send the Demo API key when one is configured.
     */
    const headers: Record<string, string> = {
      Accept: 'application/json',
    };

    if (this.config.coinGeckoApiKey) {
      headers['x-cg-demo-api-key'] = this.config.coinGeckoApiKey;
    }

    const response = await fetch(url, {
      method: 'GET',
      headers,
    });

    /**
     * Do not retry here.
     *
     * PriceFeedService detects 429 and activates the global provider
     * cooldown. Retrying here would defeat that protection.
     */
    if (!response.ok) {
      if (response.status === 429) {
        throw new Error(
          'CoinGecko request failed with status 429 (Too Many Requests)',
        );
      }

      throw new Error(
        `CoinGecko request failed with status ${response.status}`,
      );
    }

    const body =
      (await response.json()) as CoinGeckoSimplePriceResponse;

    const quotes: MarketDataQuote[] = [];

    for (const request of requests) {
      const coin = body[request.providerSymbol];

      if (!coin) {
        continue;
      }

      const currencyKey = request.quoteCurrency.toLowerCase();
      const rawPrice = coin[currencyKey];

      /**
       * CoinGecko normally returns JSON numbers for simple/price.
       *
       * Convert the primitive value immediately into a decimal string
       * and never expose a numeric price to the rest of the application.
       *
       * PriceFeedService subsequently performs exact decimal scaling.
       */
      const priceDecimal = this.normalizePrice(rawPrice);

      if (priceDecimal === undefined) {
        continue;
      }

      const observedAt = this.parseObservedAt(
        coin.last_updated_at,
      );

      quotes.push({
        providerSymbol: request.providerSymbol,
        quoteCurrency: request.quoteCurrency,
        priceDecimal,
        observedAt,
      });
    }

    return quotes;
  }

  /**
   * Normalize a CoinGecko price into the provider contract's required
   * decimal-string representation.
   *
   * The application never receives a numeric price from this provider.
   */
  private normalizePrice(
    value: unknown,
  ): string | undefined {
    if (typeof value === 'string') {
      const normalized = value.trim();

      if (
        normalized.length === 0 ||
        !this.isValidDecimal(normalized)
      ) {
        return undefined;
      }

      return normalized;
    }

    if (
      typeof value === 'number' &&
      Number.isFinite(value) &&
      value > 0
    ) {
      /**
       * CoinGecko's JSON API normally serializes these values as numbers.
       *
       * String(value) is used only at the provider boundary to satisfy
       * the provider contract. PriceFeedService subsequently performs
       * exact decimal scaling without multiplying the number.
       */
      const normalized = String(value);

      if (!this.isValidDecimal(normalized)) {
        return undefined;
      }

      return normalized;
    }

    return undefined;
  }

  /**
   * Validate a positive decimal representation.
   *
   * Scientific notation is accepted because JSON numeric serialization
   * can legitimately produce values such as 1e-8.
   *
   * PriceFeedService remains responsible for enforcing the instrument's
   * configured precision.
   */
  private isValidDecimal(value: string): boolean {
    return /^[+]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(
      value,
    );
  }

  /**
   * Parse CoinGecko's Unix timestamp.
   *
   * CoinGecko's last_updated_at is expressed in seconds.
   *
   * If it is missing or malformed, use the current time rather than
   * fabricating an old observation timestamp.
   */
  private parseObservedAt(value: unknown): Date {
    if (
      typeof value === 'number' &&
      Number.isFinite(value) &&
      value > 0
    ) {
      const date = new Date(value * 1000);

      if (!Number.isNaN(date.getTime())) {
        return date;
      }
    }

    if (
      typeof value === 'string' &&
      value.trim().length > 0
    ) {
      const numeric = Number(value);

      if (
        Number.isFinite(numeric) &&
        numeric > 0
      ) {
        const date = new Date(numeric * 1000);

        if (!Number.isNaN(date.getTime())) {
          return date;
        }
      }
    }

    return new Date();
  }
}