import { IsIn, IsInt, IsOptional, IsString, IsUUID, Matches, Max, Min } from 'class-validator';

import { SUPPORTED_CURRENCIES } from '../../wallet/wallet.constants';

const BET_TYPES = ['rise_fall', 'higher_lower', 'up_down'] as const;

export class PlaceBetDto {
  @IsUUID()
  instrumentId!: string;

  @IsIn(BET_TYPES)
  type!: (typeof BET_TYPES)[number];

  @IsString()
  selection!: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d+(\.\d+)?$/, { message: 'targetPrice must be a positive decimal string' })
  targetPrice?: string;

  @IsString()
  @Matches(/^[1-9]\d*$/, { message: 'stakeAmount must be a positive integer string (minor units)' })
  stakeAmount!: string;

  @IsIn(SUPPORTED_CURRENCIES)
  currency!: string;

  @IsInt()
  @Min(1)
  @Max(31_536_000) // 1 year, generous outer bound — actual bounds come from the market's own config
  durationSeconds!: number;
}
