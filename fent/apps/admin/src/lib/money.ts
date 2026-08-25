import { KNOWN_CURRENCIES, Money } from '@fenticoin/domain';

/** Every currency the ledger understands — used to let an admin pick which wallet/instrument currency they're viewing or acting on, instead of assuming USD. */
export const SUPPORTED_CURRENCY_CODES: readonly string[] = Object.keys(KNOWN_CURRENCIES);

/**
 * Two different scales matter here, and mixing them up would misrepresent
 * real money: wallet amounts (stake, payout, balance) are minor units of
 * the *currency* (e.g. USD cents, always 2 decimals); instrument prices
 * (entry/settlement/target) are minor units scaled to that instrument's
 * own `pricePrecision`, which is unrelated to the currency's decimals.
 */

/** Parses admin-typed amount input (e.g. "12.50") into minor units for a request body. Never uses floats. */
export function parseAmountToMinorUnits(decimal: string, currencyCode: string): bigint {
  const currency = KNOWN_CURRENCIES[currencyCode] ?? { code: currencyCode, decimals: 2 };
  return Money.fromDecimalString(decimal, currency).toMinorUnits();
}

/** Formats a wallet-currency minor-units string (stake, payout, balance) for display, e.g. "$12.50". */
export function formatCurrencyMinorUnits(minorUnits: string, currencyCode: string): string {
  const currency = KNOWN_CURRENCIES[currencyCode] ?? { code: currencyCode, decimals: 2 };
  const decimal = Money.fromMinorUnits(BigInt(minorUnits), currency).toDecimalString();
  return currencyCode === 'USD' ? `$${decimal}` : `${decimal} ${currencyCode}`;
}

/** Formats an instrument-precision-scaled price (entry/settlement price) for display — precision comes from the instrument, not the currency. */
export function formatInstrumentPrice(minorUnits: string, pricePrecision: number, currencyCode: string): string {
  const decimal = Money.fromMinorUnits(BigInt(minorUnits), { code: currencyCode, decimals: pricePrecision }).toDecimalString();
  return currencyCode === 'USD' ? `$${decimal}` : `${decimal} ${currencyCode}`;
}
