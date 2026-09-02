import { ServiceUnavailableException } from '@nestjs/common';

/**
 * Thrown by PriceFeedService when the newest trusted market tick is older
 * than the instrument's configured maxPriceAgeSeconds.
 *
 * This guard prevents bets and settlements from being priced using stale
 * market data. The operation must fail rather than silently use an old quote.
 */
export class StalePriceError extends ServiceUnavailableException {
  constructor(details: {
    instrumentId: string;
    ageSeconds: number;
    maxAgeSeconds: number;
  }) {
    super({
      message: 'Latest price is stale',
      code: 'STALE_PRICE',
      ...details,
    });
  }
}

/**
 * Thrown when no trusted market tick has ever been recorded for the
 * instrument.
 */
export class NoPriceAvailableError extends ServiceUnavailableException {
  constructor(instrumentId: string) {
    super({
      message: 'No price is available for this instrument yet',
      code: 'NO_PRICE_AVAILABLE',
      instrumentId,
    });
  }
}