/**
 * A currency understood by the ledger. `decimals` is the number of minor
 * units per major unit (e.g. USD has 2: 100 minor units = 1.00 USD).
 */
export interface Currency {
  readonly code: string;
  readonly decimals: number;
}

export const USD: Currency = { code: 'USD', decimals: 2 };
export const EUR: Currency = { code: 'EUR', decimals: 2 };
export const GBP: Currency = { code: 'GBP', decimals: 2 };

export const KNOWN_CURRENCIES: Readonly<Record<string, Currency>> = {
  USD,
  EUR,
  GBP,
};
