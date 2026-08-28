
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

import { PriceFeedService } from './price-feed.service';

@Injectable()
export class PriceRefreshScheduler {
  private readonly logger = new Logger(PriceRefreshScheduler.name);

  private refreshing = false;

  constructor(private readonly priceFeedService: PriceFeedService) {}

  /**
   * Refresh market prices periodically.
   *
   * The refresh is guarded so that a slow provider request cannot overlap
   * with the next scheduled cycle.
   *
   * We intentionally keep the trusted stale-price validation inside
   * PriceFeedService. If the provider fails, the system must NOT fabricate
   * or reuse an old price indefinitely.
   */
  @Cron(CronExpression.EVERY_10_SECONDS)
  async refresh(): Promise<void> {
    if (this.refreshing) {
      this.logger.warn(
        'Market-data refresh skipped because the previous refresh is still running',
      );
      return;
    }

    this.refreshing = true;

    try {
      await this.priceFeedService.refreshAllActive();
    } catch (error) {
      this.logger.error(
        `Scheduled price refresh failed: ${String(error)}`,
      );
    } finally {
      this.refreshing = false;
    }
  }
}