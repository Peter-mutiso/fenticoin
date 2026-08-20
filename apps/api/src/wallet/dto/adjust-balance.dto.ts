import { IsIn, IsString, Matches, MaxLength, MinLength } from 'class-validator';

import { SUPPORTED_CURRENCIES } from '../wallet.constants';

export class AdjustBalanceDto {
  @IsIn(SUPPORTED_CURRENCIES)
  currency!: string;

  @IsString()
  @Matches(/^[1-9]\d*$/, { message: 'amountMinorUnits must be a positive integer string' })
  amountMinorUnits!: string;

  @IsIn(['credit', 'debit'])
  direction!: 'credit' | 'debit';

  @IsString()
  @MinLength(5, { message: 'reason must explain the adjustment (at least 5 characters)' })
  @MaxLength(500)
  reason!: string;
}
