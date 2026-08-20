import { IsIn, IsString, Matches } from 'class-validator';

import { SUPPORTED_CURRENCIES } from '../wallet.constants';

/**
 * Amounts travel over JSON as decimal-digit strings, never `number` —
 * JSON numbers are IEEE-754 floats, and a float can't losslessly carry an
 * arbitrary-precision minor-unit integer. The controller converts this to
 * a real `bigint` before it ever reaches a service.
 */
export class MoneyAmountDto {
  @IsIn(SUPPORTED_CURRENCIES)
  currency!: string;

  @IsString()
  @Matches(/^[1-9]\d*$/, { message: 'amountMinorUnits must be a positive integer string' })
  amountMinorUnits!: string;
}
