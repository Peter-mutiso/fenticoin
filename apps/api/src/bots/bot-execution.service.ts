import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';

import { AuditLogService } from '../audit/audit-log.service';
import { BettingService } from '../betting/betting.service';
import { DRIZZLE_CLIENT } from '../database/database.constants';
import type { DrizzleDb } from '../database/database.types';
import { bets, bots, tradingBotLogs } from '../database/schema';
import { BOT_STRATEGY_PROVIDERS, type StrategyProvider, type StrategySignal } from './strategy.interface';

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

    let signal: StrategySignal | null;
    try {
      signal = await strategy.evaluate({ bot, now });
    } catch (error) {
      await this.writeLog(bot.id, 'error', `Strategy evaluation failed: ${describeError(error)}`);
      return false;
    }
    // No signal this tick is a normal, frequent outcome (most strategies
    // are evaluated far more often than they act) — not worth a log row,
    // to keep the bot's execution log an honest record of things that
    // actually happened rather than a per-tick heartbeat.
    if (!signal) return false;

    const idempotencyKey = `bot:${bot.id}:${signal.dedupeKey ?? now.toISOString()}`;
    const [existingBet] = await this.db.select({ id: bets.id }).from(bets).where(eq(bets.idempotencyKey, idempotencyKey)).limit(1);
    if (existingBet) return false; // already executed for this schedule/decision slot

    try {
      const bet = await this.bettingService.placeBet({
        instrumentId: signal.instrumentId,
        type: signal.type,
        selection: signal.selection,
        targetPrice: signal.targetPrice,
        stakeAmount: signal.stakeAmount,
        currency: signal.currency,
        durationSeconds: BigInt(signal.durationSeconds),
        userId: bot.userId,
        botId: bot.id,
        idempotencyKey,
      });
      await this.writeLog(bot.id, 'success', `Placed a ${signal.type} bet (${signal.selection}).`, bet.id, serializeSignal(signal));
      await this.auditLog.record({
        actorUserId: bot.userId,
        action: 'bot.bet_placed',
        targetType: 'bot',
        targetId: bot.id,
        after: { betId: bet.id, strategyKey: bot.strategyKey },
      });
      return true;
    } catch (error) {
      await this.writeLog(bot.id, 'error', `Bet placement failed: ${describeError(error)}`, undefined, serializeSignal(signal));
      return false;
    }
  }

  async runActiveBots(now = new Date()): Promise<void> {
    const active = await this.db.select({ id: bots.id }).from(bots).where(eq(bots.status, 'active'));
    for (const bot of active) {
      try {
        await this.execute(bot.id, now);
      } catch (error) {
        this.logger.error(`Bot ${bot.id} execution failed: ${describeError(error)}`);
      }
    }
  }

  private async writeLog(
    botId: string,
    level: 'info' | 'success' | 'skipped' | 'error',
    message: string,
    betId?: string,
    signal?: unknown,
  ): Promise<void> {
    await this.db.insert(tradingBotLogs).values({ botId, level, message, betId, signal: signal ?? null });
  }
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function serializeSignal(signal: StrategySignal): Record<string, unknown> {
  return { ...signal, stakeAmount: signal.stakeAmount.toString() };
}
