import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

import { DepositService } from './deposit.service';

/** Periodically sweeps `pending` deposits past their `expiresAt` into `expired` — the only automatic trigger for that transition. */
@Injectable()
export class DepositExpiryScheduler {
  private readonly logger = new Logger(DepositExpiryScheduler.name);

  constructor(private readonly depositService: DepositService) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async run(): Promise<void> {
    try {
      await this.depositService.expireStaleDeposits();
    } catch (error) {
      this.logger.error(`Deposit expiry sweep failed: ${String(error)}`);
    }
  }
}
