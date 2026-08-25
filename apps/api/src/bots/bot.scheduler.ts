import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

import { BotExecutionService } from './bot-execution.service';

@Injectable()
export class BotScheduler {
  constructor(private readonly executionService: BotExecutionService) {}

  @Cron(CronExpression.EVERY_5_SECONDS)
  run(): Promise<void> { return this.executionService.runActiveBots(); }
}