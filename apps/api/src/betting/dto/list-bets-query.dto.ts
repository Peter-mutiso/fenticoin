import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';

const BET_STATUSES = ['pending', 'open', 'won', 'lost', 'void', 'cancelled', 'refunded', 'disputed'] as const;

export class ListBetsQueryDto {
  @IsOptional()
  @IsIn(BET_STATUSES)
  status?: (typeof BET_STATUSES)[number];

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
