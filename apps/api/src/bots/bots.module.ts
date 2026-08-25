import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module';
import { BettingModule } from '../betting/betting.module';
import { BotController } from './bot.controller';
import { BotExecutionService } from './bot-execution.service';
import { BotService } from './bot.service';
import { BotScheduler } from './bot.scheduler';
import { BOT_STRATEGY_PROVIDERS } from './strategy.interface';

@Module({
	imports: [AuditModule, BettingModule],
	controllers: [BotController],
	providers: [BotService, BotExecutionService, BotScheduler, { provide: BOT_STRATEGY_PROVIDERS, useValue: [] }],
	exports: [BotService],
})
export class BotsModule {}