
import { Money } from '@fenticoin/domain';

import type { Instrument, PriceTick } from '../database/schema';

/**
 * API-safe price quote.
 *
 * Internally, prices remain exact Money values so settlement and comparison
 * never depend on JavaScript floating-point arithmetic.
 *
 * At the API boundary, `price` is exposed as a decimal string. This is
 * intentional: JSON cannot safely represent bigint-based monetary values,
 * and serialising the Money object directly can result in the frontend
 * receiving an unexpected object shape or `undefined`.
 */
export interface PriceQuote {
  instrumentId: string;

  /**
   * Exact decimal representation of the price.
   *
   * Example:
   *   "109234.52000000"
   *
   * Never use a JavaScript number for financial/market prices.
   */
  price: string;

  source: string;
  observedAt: Date;
  receivedAt: Date;
  isStale: boolean;
}

/**
 * Convert a database price tick into an API-safe PriceQuote.
 *
 * The database stores the price as an exact scaled bigint.
 * Money is used for exact arithmetic and then explicitly converted to its
 * decimal string representation for JSON/API consumers.
 */
export function toPriceQuote(
  tick: PriceTick,
  instrument: Pick<
    Instrument,
    'quoteCurrency' | 'pricePrecision'
  >,
  isStale: boolean,
): PriceQuote {
  const money = Money.fromMinorUnits(tick.price, {
    code: instrument.quoteCurrency,
    decimals: instrument.pricePrecision,
  });

  return {
    instrumentId: tick.instrumentId,
    price: money.toDecimalString(),
    source: tick.source,
    observedAt: tick.observedAt,
    receivedAt: tick.receivedAt,
    isStale,
  };
}
