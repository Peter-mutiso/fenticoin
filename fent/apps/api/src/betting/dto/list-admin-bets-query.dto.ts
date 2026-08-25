import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

const BET_STATUSES = ['pending', 'open', 'won', 'lost', 'void', 'cancelled', 'refunded', 'disputed', 'requires_review'] as const;

export class ListAdminBetsQueryDto {
  @IsOptional()
  @IsIn(BET_STATUSES)
  status?: (typeof BET_STATUSES)[number];

  @IsOptional()
  @IsUUID()
  userId?: string;

  @IsOptional()
  @IsUUID()
  instrumentId?: string;

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
