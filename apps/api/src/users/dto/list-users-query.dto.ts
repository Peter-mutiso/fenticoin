import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class ListUsersQueryDto {
  /** Partial, case-insensitive match against email — never an exact-match-only search. */
  @IsOptional()
  @IsString()
  @MaxLength(320)
  email?: string;

  @IsOptional()
  @IsIn(['active', 'suspended', 'banned', 'pending_deletion'])
  status?: 'active' | 'suspended' | 'banned' | 'pending_deletion';

  @IsOptional()
  @IsIn(['unverified', 'pending', 'approved', 'rejected'])
  kycStatus?: 'unverified' | 'pending' | 'approved' | 'rejected';

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
