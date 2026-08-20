import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { and, eq, lte } from 'drizzle-orm';

import { DRIZZLE_CLIENT } from '../database/database.constants';
import type { DrizzleDb } from '../database/database.types';
import { bets } from '../database/schema';
import { SettlementService } from './settlement.service';

/** Polls for expired-but-still-open bets and settles each — the only trigger for settlement besides an admin's manual action. */
@Injectable()
export class BetSettlementScheduler {
  private readonly logger = new Logger(BetSettlementScheduler.name);

  constructor(
    @Inject(DRIZZLE_CLIENT) private readonly db: DrizzleDb,
    private readonly settlementService: SettlementService,
  ) {}

  @Cron(CronExpression.EVERY_5_SECONDS)
  async run(): Promise<void> {
    try {
      await this.settlementService.releaseStuckClaims();

      const due = await this.db
        .select({ id: bets.id })
        .from(bets)
        .where(and(eq(bets.status, 'open'), lte(bets.expiresAt, new Date())));

      for (const { id } of due) {
        try {
          await this.settlementService.settleBet(id);
        } catch (error) {
          this.logger.error(`Failed to settle bet ${id}: ${String(error)}`);
        }
      }
    } catch (error) {
      this.logger.error(`Settlement sweep failed: ${String(error)}`);
    }
  }
}
