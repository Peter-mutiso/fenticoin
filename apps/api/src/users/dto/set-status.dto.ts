import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class SetUserStatusDto {
  @IsIn(['active', 'suspended', 'banned'])
  status!: 'active' | 'suspended' | 'banned';

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
