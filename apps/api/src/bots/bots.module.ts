import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module';
import { BettingModule } from '../betting/betting.module';
import { MarketsModule } from '../markets/markets.module';
import { BotController } from './bot.controller';
import { BotExecutionService } from './bot-execution.service';
import { BotService } from './bot.service';
import { BotScheduler } from './bot.scheduler';
import { MomentumStrategy } from './strategies/momentum.strategy';
import { RecurringStrategy } from './strategies/recurring.strategy';
import { BOT_STRATEGY_PROVIDERS, type StrategyProvider } from './strategy.interface';

@Module({
  imports: [AuditModule, BettingModule, MarketsModule],
  controllers: [BotController],
  providers: [
    BotService,
    BotExecutionService,
    BotScheduler,
    RecurringStrategy,
    MomentumStrategy,
    {
      provide: BOT_STRATEGY_PROVIDERS,
      useFactory: (recurring: RecurringStrategy, momentum: MomentumStrategy): StrategyProvider[] => [recurring, momentum],
      inject: [RecurringStrategy, MomentumStrategy],
    },
  ],
  exports: [BotService],
})
export class BotsModule {}
