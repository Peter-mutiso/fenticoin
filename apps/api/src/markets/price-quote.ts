import { Money } from '@fenticoin/domain';

import type { Instrument, PriceTick } from '../database/schema';

/**
 * A price tick as exact arithmetic, reusing `@fenticoin/domain`'s `Money`
 * value object — not because a price is currency, but because "an integer
 * count of minor units at N decimal places, safely displayable, never a
 * float" is exactly what a price quote needs too. Any two `PriceQuote`s
 * for the same instrument can be compared exactly (`.compareTo`), which
 * is what makes this a fit foundation for deterministic bet settlement
 * later (see docs/ARCHITECTURE.md §G) — no floating-point rounding can
 * ever flip a win into a loss.
 */
export interface PriceQuote {
  instrumentId: string;
  price: Money;
  source: string;
  observedAt: Date;
  receivedAt: Date;
  isStale: boolean;
}

export function toPriceQuote(tick: PriceTick, instrument: Pick<Instrument, 'quoteCurrency' | 'pricePrecision'>, isStale: boolean): PriceQuote {
  return {
    instrumentId: tick.instrumentId,
    price: Money.fromMinorUnits(tick.price, { code: instrument.quoteCurrency, decimals: instrument.pricePrecision }),
    source: tick.source,
    observedAt: tick.observedAt,
    receivedAt: tick.receivedAt,
    isStale,
  };
}
