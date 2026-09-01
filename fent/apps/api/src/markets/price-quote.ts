import { Money } from '@fenticoin/domain';

import type { Instrument, PriceTick } from '../database/schema';

/**
 * API-safe price quote.
 *
 * Internally, prices remain exact Money values so settlement and comparison
 * never depend on JavaScript floating-point arithmetic.
 *
 * At the API boundary, `price` is exposed as a decimal string.
 */
export interface PriceQuote {
  instrumentId: string;

  /**
   * Exact decimal representation of the price.
 *
   * Example:
   *   "109234.52000000"
   */
  price: string;

  /**
   * Currency of the quoted price.
   *
   * This is explicit because `price` is now an API-safe string and therefore
   * no longer carries Money.currency metadata.
   */
  quoteCurrency: string;

  /**
   * Number of decimal places represented by `price`.
   *
   * This must come from the trusted instrument configuration.
   */
  pricePrecision: number;

  source: string;
  observedAt: Date;
  receivedAt: Date;
  isStale: boolean;
}

/**
 * Convert an exact decimal price string into its scaled bigint
 * representation.
 *
 * This deliberately does NOT use Number(), parseFloat(), or floating-point
 * arithmetic.
 *
 * Examples:
 *
 *   decimalToMinorUnits("112503.27", 2)
 *     => 11250327n
 *
 *   decimalToMinorUnits("112503.27000000", 8)
 *     => 11250327000000n
 *
 *   decimalToMinorUnits("100", 2)
 *     => 10000n
 *
 * The precision is supplied by trusted instrument configuration.
 */
export function decimalToMinorUnits(
  value: string,
  precision: number,
): bigint {
  if (!Number.isInteger(precision) || precision < 0) {
    throw new Error(
      `Invalid price precision: ${precision}`,
    );
  }

  const normalized = value.trim();

  if (!/^\d+(?:\.\d+)?$/.test(normalized)) {
    throw new Error(
      `Invalid decimal price: ${value}`,
    );
  }

  const [wholePart, fractionalPart = ''] =
    normalized.split('.');

  if (fractionalPart.length > precision) {
    throw new Error(
      `Price ${value} has more than ${precision} decimal places`,
    );
  }

  const paddedFraction =
    fractionalPart.padEnd(precision, '0');

  const digits =
    `${wholePart}${paddedFraction}` || '0';

  return BigInt(digits);
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
  const money = Money.fromMinorUnits(
    tick.price,
    {
      code: instrument.quoteCurrency,
      decimals: instrument.pricePrecision,
    },
  );

  return {
    instrumentId: tick.instrumentId,
    price: money.toDecimalString(),
    quoteCurrency: instrument.quoteCurrency,
    pricePrecision: instrument.pricePrecision,
    source: tick.source,
    observedAt: tick.observedAt,
    receivedAt: tick.receivedAt,
    isStale,
  };
}