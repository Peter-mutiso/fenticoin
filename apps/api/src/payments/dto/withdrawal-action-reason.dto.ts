import { IsString, MaxLength, MinLength } from 'class-validator';

export class WithdrawalActionReasonDto {
  @IsString()
  @MinLength(5, { message: 'reason must explain the action (at least 5 characters)' })
  @MaxLength(500)
  reason!: string;
}
