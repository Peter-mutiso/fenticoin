import { KNOWN_CURRENCIES, Money } from '@fenticoin/domain';

/**
 * Two different scales matter here, and mixing them up would misrepresent
 * real money: wallet amounts (stake, payout, balance) are minor units of
 * the *currency* (e.g. USD cents, always 2 decimals); instrument prices
 * (entry/settlement/target) are minor units scaled to that instrument's
 * own `pricePrecision`, which is unrelated to the currency's decimals.
 */

/** Parses user-typed stake input (e.g. "12.50") into minor units for the placement request. Never uses floats. */
export function parseStakeToMinorUnits(decimal: string, currencyCode: string): bigint {
  const currency = KNOWN_CURRENCIES[currencyCode] ?? { code: currencyCode, decimals: 2 };
  return Money.fromDecimalString(decimal, currency).toMinorUnits();
}

/** Formats a wallet-currency minor-units string (stake, payout, balance) for display, e.g. "$12.50". */
export function formatCurrencyMinorUnits(minorUnits: string, currencyCode: string): string {
  const currency = KNOWN_CURRENCIES[currencyCode] ?? { code: currencyCode, decimals: 2 };
  const decimal = Money.fromMinorUnits(BigInt(minorUnits), currency).toDecimalString();
  return currencyCode === 'USD' ? `$${decimal}` : `${decimal} ${currencyCode}`;
}

/** Bare decimal string (no currency symbol), for pre-filling an editable amount input from a persisted minor-units value — e.g. "12.50". */
export function minorUnitsToDecimalString(minorUnits: string, currencyCode: string): string {
  const currency = KNOWN_CURRENCIES[currencyCode] ?? { code: currencyCode, decimals: 2 };
  return Money.fromMinorUnits(BigInt(minorUnits), currency).toDecimalString();
}

/** Formats an instrument-precision-scaled price (entry/settlement price) for display — precision comes from the instrument, not the currency. */
export function formatInstrumentPrice(minorUnits: string, pricePrecision: number, currencyCode: string): string {
  const decimal = Money.fromMinorUnits(BigInt(minorUnits), { code: currencyCode, decimals: pricePrecision }).toDecimalString();
  return currencyCode === 'USD' ? `$${decimal}` : `${decimal} ${currencyCode}`;
}

/**
 * Client-side estimate of the potential payout, purely for display before
 * submission — mirrors `OddsEngine.calculatePotentialPayout` exactly
 * (stake + floor(stake * rate / 10000)) using the same shared `Money`
 * arithmetic, but this is never what gets charged: the server recomputes
 * and snapshots the authoritative rate/payout at placement time.
 */
export function estimatePotentialPayoutMinorUnits(stakeMinorUnits: bigint, payoutRateBasisPoints: bigint, currencyCode: string): bigint {
  const currency = KNOWN_CURRENCIES[currencyCode] ?? { code: currencyCode, decimals: 2 };
  const stake = Money.fromMinorUnits(stakeMinorUnits, currency);
  return stake.add(stake.applyBasisPoints(payoutRateBasisPoints, 'floor')).toMinorUnits();
}
