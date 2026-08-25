import { IsIn, IsString, MaxLength, MinLength } from 'class-validator';

export class SetEligibilityDto {
  @IsIn(['eligible', 'ineligible', 'unknown'])
  status!: 'eligible' | 'ineligible' | 'unknown';

  @IsString()
  @MinLength(5)
  @MaxLength(500)
  reason!: string;
}
