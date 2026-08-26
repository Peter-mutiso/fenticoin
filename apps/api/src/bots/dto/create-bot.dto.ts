import { IsObject, IsString, Length } from 'class-validator';

export class CreateBotDto {
  @IsString()
  @Length(1, 80)
  name!: string;

  @IsString()
  strategyKey!: string;

  @IsObject()
  config!: Record<string, unknown>;
}
