import { IsIn, IsString, MaxLength, MinLength } from 'class-validator';

export class SetInstrumentStatusDto {
  @IsIn(['active', 'suspended', 'delisted'])
  status!: 'active' | 'suspended' | 'delisted';

  @IsString()
  @MinLength(5, { message: 'reason must explain the status change (at least 5 characters)' })
  @MaxLength(500)
  reason!: string;
}
