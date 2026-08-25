import { IsInt, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class CreateMarketCategoryDto {
  @IsString()
  @Matches(/^[a-z0-9_-]{1,30}$/, { message: 'key must be lowercase alphanumeric/underscore/hyphen' })
  key!: string;

  @IsString()
  @MaxLength(60)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsInt()
  displayOrder?: number;
}
