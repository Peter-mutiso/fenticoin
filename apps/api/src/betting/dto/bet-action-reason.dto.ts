import { IsIn, IsString, MaxLength, MinLength } from 'class-validator';

export class BetActionReasonDto {
  @IsString()
  @MinLength(5, { message: 'reason must explain the action (at least 5 characters)' })
  @MaxLength(500)
  reason!: string;
}

export class ResolveDisputeDto extends BetActionReasonDto {
  @IsIn(['uphold', 'reverse'])
  resolution!: 'uphold' | 'reverse';
}

export class ResolveManualReviewDto extends BetActionReasonDto {
  @IsIn(['win', 'loss', 'void'])
  resolution!: 'win' | 'loss' | 'void';
}
