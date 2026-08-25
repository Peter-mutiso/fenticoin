import { ServiceUnavailableException } from '@nestjs/common';

/**
 * Thrown by `PriceFeedService.getLatestPrice` when the newest tick is
 * older than the instrument's `maxPriceAgeSeconds`. This is the guard
 * that keeps a future settlement engine from ever pricing a bet off a
 * feed that's gone silent — it must fail loudly, not settle on stale data.
 */
export class StalePriceError extends ServiceUnavailableException {
  constructor(details: { instrumentId: string; ageSeconds: number; maxAgeSeconds: number }) {
    super({
      message: 'Latest price is stale',
      code: 'STALE_PRICE',
      ...details,
    });
  }
}

/** No tick has ever been recorded for this instrument. */
export class NoPriceAvailableError extends ServiceUnavailableException {
  constructor(instrumentId: string) {
    super({ message: 'No price is available for this instrument yet', code: 'NO_PRICE_AVAILABLE', instrumentId });
  }
}
