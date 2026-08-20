import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

import { PriceFeedService } from './price-feed.service';

/**
 * Periodically pulls fresh quotes for every active instrument. This is
 * what keeps `getLatestPrice` from reporting stale prices under normal
 * operation — the interval should stay comfortably shorter than the
 * shortest `maxPriceAgeSeconds` any instrument is configured with.
 */
@Injectable()
export class PriceRefreshScheduler {
  private readonly logger = new Logger(PriceRefreshScheduler.name);

  constructor(private readonly priceFeedService: PriceFeedService) {}

  @Cron(CronExpression.EVERY_10_SECONDS)
  async refresh(): Promise<void> {
    try {
      await this.priceFeedService.refreshAllActive();
    } catch (error) {
      this.logger.error(`Scheduled price refresh failed: ${String(error)}`);
    }
  }
}
