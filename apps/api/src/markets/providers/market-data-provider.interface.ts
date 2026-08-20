export interface MarketDataQuoteRequest {
  providerSymbol: string;
  quoteCurrency: string;
}

export interface MarketDataQuote {
  providerSymbol: string;
  quoteCurrency: string;
  /**
   * A decimal string (e.g. "112503.27"), never a `number` — the whole
   * point is to keep floating point out of the pipeline from the moment
   * a price enters the system. `PriceFeedService` is what converts this
   * to a scaled `bigint` using the instrument's `pricePrecision`, via
   * exact string arithmetic, not `Number()` + multiply.
   */
  priceDecimal: string;
  observedAt: Date;
}

/**
 * Provider-agnostic market-data abstraction — mirrors the shape of the
 * OAuth/SMS/payment provider interfaces elsewhere in this codebase.
 * Nothing in `PriceFeedService` depends on a specific vendor's SDK.
 */
export interface MarketDataProvider {
  readonly name: string;
  isConfigured(): boolean;
  getQuotes(requests: MarketDataQuoteRequest[]): Promise<MarketDataQuote[]>;
}

export const MARKET_DATA_PROVIDER = Symbol('MARKET_DATA_PROVIDER');
