import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';

import { AuditModule } from '../audit/audit.module';
import { AdminMarketsController } from './admin-markets.controller';
import { InstrumentService } from './instrument.service';
import { MarketCategoryService } from './market-category.service';
import { MarketsController } from './markets.controller';
import { PriceFeedService } from './price-feed.service';
import { PriceRefreshScheduler } from './price-refresh.scheduler';
import { MarketDataProvidersModule } from './providers/providers.module';

@Module({
  imports: [AuditModule, MarketDataProvidersModule, ScheduleModule.forRoot()],
  controllers: [MarketsController, AdminMarketsController],
  providers: [InstrumentService, MarketCategoryService, PriceFeedService, PriceRefreshScheduler],
  exports: [InstrumentService, MarketCategoryService, PriceFeedService],
})
export class MarketsModule {}
