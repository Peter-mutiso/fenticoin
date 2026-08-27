import type { Bot, TradingBotLog } from '../database/schema';
import type { BotStats } from './bot.service';

export function serializeBot(bot: Bot, stats?: BotStats) {
  return {
    id: bot.id,
    userId: bot.userId,
    name: bot.name,
    status: bot.status,
    strategyKey: bot.strategyKey,
    config: bot.config,
    executionIntervalSeconds: bot.executionIntervalSeconds,
    createdAt: bot.createdAt,
    updatedAt: bot.updatedAt,
    stats: stats
      ? {
          totalExecutions: stats.totalExecutions,
          totalTrades: stats.totalTrades,
          totalPnlMinorUnits: stats.totalPnl.toString(),
        }
      : undefined,
  };
}

export function serializeBotLog(log: TradingBotLog) {
  return {
    id: log.id,
    botId: log.botId,
    occurredAt: log.occurredAt,
    level: log.level,
    message: log.message,
    betId: log.betId,
    signal: log.signal,
  };
}
