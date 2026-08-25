import { BadRequestException } from '@nestjs/common';
import type { Currency } from '@fenticoin/domain';
import { KNOWN_CURRENCIES } from '@fenticoin/domain';

export const HOUSE_SYSTEM_ACCOUNT_KEYS = ['house_cash', 'house_revenue', 'house_liability'] as const;
export type HouseSystemAccountKey = (typeof HOUSE_SYSTEM_ACCOUNT_KEYS)[number];

export const SUPPORTED_CURRENCIES: readonly string[] = Object.keys(KNOWN_CURRENCIES);

export function requireCurrency(code: string): Currency {
  const currency = KNOWN_CURRENCIES[code];
  if (!currency) {
    throw new BadRequestException(`Unsupported currency: ${code}`);
  }
  return currency;
}
