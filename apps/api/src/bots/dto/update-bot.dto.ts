import { IsObject, IsOptional, IsString, Length } from 'class-validator';

export class UpdateBotDto {
  @IsOptional()
  @IsString()
  @Length(1, 80)
  name?: string;

  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;
}
