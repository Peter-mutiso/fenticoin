import { IsIn, IsObject, IsOptional, IsString, Length } from 'class-validator';

import { ALLOWED_EXECUTION_INTERVAL_SECONDS } from '../execution-interval';

export class UpdateBotDto {
  @IsOptional()
  @IsString()
  @Length(1, 80)
  name?: string;

  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;

  @IsOptional()
  @IsIn(ALLOWED_EXECUTION_INTERVAL_SECONDS)
  executionIntervalSeconds?: number;
}
