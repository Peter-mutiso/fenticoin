import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

const DEPOSIT_STATUSES = ['pending', 'completed', 'failed', 'cancelled', 'expired'] as const;

export class ListDepositsQueryDto {
  @IsOptional()
  @IsIn(DEPOSIT_STATUSES)
  status?: (typeof DEPOSIT_STATUSES)[number];

  @IsOptional()
  @IsUUID()
  userId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 25;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number = 0;
}
