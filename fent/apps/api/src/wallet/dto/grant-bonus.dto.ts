import { IsIn, IsString, Matches, MaxLength, MinLength } from 'class-validator';

import { SUPPORTED_CURRENCIES } from '../wallet.constants';

export class GrantBonusDto {
  @IsIn(SUPPORTED_CURRENCIES)
  currency!: string;

  @IsString()
  @Matches(/^[1-9]\d*$/, { message: 'amountMinorUnits must be a positive integer string' })
  amountMinorUnits!: string;

  @IsString()
  @MinLength(5, { message: 'reason must explain the bonus grant (at least 5 characters)' })
  @MaxLength(500)
  reason!: string;
}
