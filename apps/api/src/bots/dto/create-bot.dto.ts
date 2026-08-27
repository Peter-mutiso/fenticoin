import { IsIn, IsObject, IsString, Length } from 'class-validator';

import { ALLOWED_EXECUTION_INTERVAL_SECONDS } from '../execution-interval';

export class CreateBotDto {
  @IsString()
  @Length(1, 80)
  name!: string;

  @IsString()
  strategyKey!: string;

  @IsObject()
  config!: Record<string, unknown>;

  /** Must be one of `ALLOWED_EXECUTION_INTERVAL_SECONDS` — see `execution-interval.ts`. */
  @IsIn(ALLOWED_EXECUTION_INTERVAL_SECONDS)
  executionIntervalSeconds!: number;
}
