import { IsIn, IsString, MaxLength, MinLength } from 'class-validator';

export class ResolveDepositDto {
  @IsIn(['completed', 'failed'])
  outcome!: 'completed' | 'failed';

  @IsString()
  @MinLength(5, { message: 'reason must explain the manual resolution (at least 5 characters)' })
  @MaxLength(500)
  reason!: string;
}
