import { IsDateString } from 'class-validator';

export class ReportsDateRangeQueryDto {
  @IsDateString()
  from!: string;

  @IsDateString()
  to!: string;
}
