import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';

import { AuditLogService } from '../audit/audit-log.service';
import { BettingService } from '../betting/betting.service';
import { DRIZZLE_CLIENT } from '../database/database.constants';
import type { DrizzleDb } from '../database/database.types';
import { bots } from '../database/schema';
import { BOT_STRATEGY_PROVIDERS, type StrategyProvider } from './strategy.interface';

@Injectable()
export class BotExecutionService {
  private readonly logger = new Logger(BotExecutionService.name);

  constructor(
    @Inject(DRIZZLE_CLIENT) private readonly db: DrizzleDb,
    private readonly bettingService: BettingService,
    private readonly auditLog: AuditLogService,
    @Inject(BOT_STRATEGY_PROVIDERS) private readonly strategies: StrategyProvider[],
  ) {}

  async execute(botId: string, now = new Date()): Promise<boolean> {
    const [bot] = await this.db.select().from(bots).where(and(eq(bots.id, botId), eq(bots.status, 'active'))).limit(1);
    if (!bot?.strategyKey) return false;
    const strategy = this.strategies.find((candidate) => candidate.key === bot.strategyKey);
    if (!strategy) return false;
    const signal = await strategy.evaluate({ bot, now });
    if (!signal) return false;
    const bet = await this.bettingService.placeBet({ ...signal, durationSeconds: BigInt(signal.durationSeconds), userId: bot.userId, idempotencyKey: `bot:${bot.id}:${now.toISOString()}` });
    await this.auditLog.record({ actorUserId: bot.userId, action: 'bot.bet_placed', targetType: 'bot', targetId: bot.id, after: { betId: bet.id, strategyKey: bot.strategyKey } });
    return true;
  }

  async runActiveBots(now = new Date()): Promise<void> {
    const active = await this.db.select({ id: bots.id }).from(bots).where(eq(bots.status, 'active'));
    for (const bot of active) {
      try { await this.execute(bot.id, now); } catch (error) { this.logger.error(`Bot ${bot.id} execution failed: ${String(error)}`); }
    }
  }
}