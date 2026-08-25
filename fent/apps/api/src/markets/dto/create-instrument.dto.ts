import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

import { SUPPORTED_CURRENCIES } from '../../wallet/wallet.constants';

class MarketSessionWindowDto {
  @IsInt()
  @Min(0)
  @Max(6)
  dayOfWeek!: number;

  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'opensAt must be HH:MM 24-hour UTC' })
  opensAt!: string;

  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'closesAt must be HH:MM 24-hour UTC' })
  closesAt!: string;
}

export class CreateInstrumentDto {
  @IsString()
  @Matches(/^[A-Z0-9]{1,20}$/, { message: 'symbol must be 1-20 uppercase alphanumeric characters' })
  symbol!: string;

  @IsIn(SUPPORTED_CURRENCIES)
  quoteCurrency!: string;

  @IsString()
  @MaxLength(80)
  name!: string;

  @IsString()
  categoryKey!: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  providerSymbol?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(8)
  pricePrecision?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxPriceAgeSeconds?: number;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(14)
  @ValidateNested({ each: true })
  @Type(() => MarketSessionWindowDto)
  tradingSchedule?: MarketSessionWindowDto[];
}
