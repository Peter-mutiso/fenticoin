import { IsBoolean, IsIn, IsInt, IsOptional, IsUUID, Matches, Min } from 'class-validator';

const BET_TYPES = ['rise_fall', 'higher_lower', 'up_down'] as const;
const INTEGER_STRING = /^[1-9]\d*$/;

export class UpsertBettingConfigDto {
  @IsUUID()
  instrumentId!: string;

  @IsIn(BET_TYPES)
  betType!: (typeof BET_TYPES)[number];

  @Matches(INTEGER_STRING, { message: 'minStake must be a positive integer string (minor units)' })
  minStake!: string;

  @Matches(INTEGER_STRING, { message: 'maxStake must be a positive integer string (minor units)' })
  maxStake!: string;

  @Matches(INTEGER_STRING, { message: 'payoutRateBasisPoints must be a positive integer string' })
  payoutRateBasisPoints!: string;

  @IsOptional()
  @Matches(INTEGER_STRING, { message: 'maxExposure must be a positive integer string (minor units)' })
  maxExposure?: string;

  @IsInt()
  @Min(1)
  minDurationSeconds!: number;

  @IsInt()
  @Min(1)
  maxDurationSeconds!: number;

  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;
}
