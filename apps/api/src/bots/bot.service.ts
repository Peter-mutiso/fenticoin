import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, gte, inArray, sql } from 'drizzle-orm';

import { AuditLogService } from '../audit/audit-log.service';
import { DRIZZLE_CLIENT } from '../database/database.constants';
import type { DrizzleDb } from '../database/database.types';
import { bets, bots, tradingBotLogs, type Bot, type TradingBotLog } from '../database/schema';
import { InstrumentService } from '../markets/instrument.service';
import { findStrategyCatalogEntry } from './strategy-catalog';
import { validateStrategyConfig } from './strategy-config.validator';

export interface BotStats {
  totalExecutions: number;
  totalTrades: number;
  totalPnl: bigint;
}

export interface BotSummary {
  totalBots: number;
  activeBots: number;
  /** Realized P/L on bets settled in the trailing 7 days, as a percentage of the stake behind them. `null` when nothing settled in that window — never a fabricated figure. */
  weeklyReturnPercent: number | null;
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

@Injectable()
export class BotService {
  constructor(
    @Inject(DRIZZLE_CLIENT) private readonly db: DrizzleDb,
    private readonly auditLog: AuditLogService,
    private readonly instrumentService: InstrumentService,
  ) {}

  async list(userId: string): Promise<{ bots: Array<{ bot: Bot; stats: BotStats }>; summary: BotSummary }> {
    const rows = await this.db.select().from(bots).where(eq(bots.userId, userId)).orderBy(desc(bots.createdAt));
    const withStats = await Promise.all(rows.map(async (bot) => ({ bot, stats: await this.computeStats(bot.id) })));

    const weeklyReturnPercent = rows.length ? await this.computeWeeklyReturnPercent(rows.map((bot) => bot.id)) : null;

    return {
      bots: withStats,
      summary: {
        totalBots: rows.length,
        activeBots: rows.filter((bot) => bot.status === 'active').length,
        weeklyReturnPercent,
      },
    };
  }

  async getById(userId: string, botId: string): Promise<{ bot: Bot; stats: BotStats }> {
    const bot = await this.getOwned(userId, botId);
    return { bot, stats: await this.computeStats(bot.id) };
  }

  async create(userId: string, input: { name: string; strategyKey: string; config: unknown }): Promise<Bot> {
    const entry = findStrategyCatalogEntry(input.strategyKey);
    if (!entry || entry.comingSoon) throw new BadRequestException('Unknown or unavailable strategy');

    const config = await this.validateAndResolveConfig(entry.key, input.config);

    const [created] = await this.db
      .insert(bots)
      .values({ userId, name: input.name, strategyKey: input.strategyKey, config, status: 'inactive' })
      .returning();
    if (!created) throw new Error('Failed to create bot');

    await this.auditLog.record({
      actorUserId: userId,
      action: 'bot.created',
      targetType: 'bot',
      targetId: created.id,
      after: { strategyKey: input.strategyKey },
    });
    return created;
  }

  async update(userId: string, botId: string, patch: { name?: string; config?: unknown }): Promise<Bot> {
    const bot = await this.getOwned(userId, botId);
    if (bot.status === 'active') {
      throw new ConflictException('Deactivate the bot before changing its configuration');
    }

    const updates: Partial<Bot> = { updatedAt: new Date() };
    if (patch.name !== undefined) updates.name = patch.name;
    if (patch.config !== undefined) {
      if (!bot.strategyKey) throw new ConflictException('Bot has no configured strategy');
      updates.config = await this.validateAndResolveConfig(bot.strategyKey, patch.config);
    }

    const [updated] = await this.db
      .update(bots)
      .set(updates)
      .where(and(eq(bots.id, bot.id), eq(bots.userId, userId)))
      .returning();
    if (!updated) throw new NotFoundException('Bot not found');

    await this.auditLog.record({ actorUserId: userId, action: 'bot.updated', targetType: 'bot', targetId: bot.id });
    return updated;
  }

  async setActive(userId: string, botId: string, active: boolean): Promise<Bot> {
    const bot = await this.getOwned(userId, botId);
    if (active && !bot.strategyKey) throw new ConflictException('Bot strategy is not configured');

    const [updated] = await this.db
      .update(bots)
      .set({ status: active ? 'active' : 'inactive', updatedAt: new Date() })
      .where(and(eq(bots.id, bot.id), eq(bots.userId, userId)))
      .returning();
    if (!updated) throw new NotFoundException('Bot not found');

    await this.auditLog.record({
      actorUserId: userId,
      action: active ? 'bot.activated' : 'bot.deactivated',
      targetType: 'bot',
      targetId: bot.id,
    });
    return updated;
  }

  async listLogs(userId: string, botId: string, params: { limit: number; offset: number }): Promise<TradingBotLog[]> {
    await this.getOwned(userId, botId);
    return this.db
      .select()
      .from(tradingBotLogs)
      .where(eq(tradingBotLogs.botId, botId))
      .orderBy(desc(tradingBotLogs.occurredAt))
      .limit(params.limit)
      .offset(params.offset);
  }

  private async getOwned(userId: string, botId: string): Promise<Bot> {
    const [bot] = await this.db.select().from(bots).where(and(eq(bots.id, botId), eq(bots.userId, userId))).limit(1);
    if (!bot) throw new NotFoundException('Bot not found');
    return bot;
  }

  private async validateAndResolveConfig(strategyKey: string, rawConfig: unknown): Promise<Record<string, unknown>> {
    const entry = findStrategyCatalogEntry(strategyKey);
    if (!entry) throw new BadRequestException('Unknown strategy');
    const config = validateStrategyConfig(entry, rawConfig);

    if (typeof config.instrumentId === 'string') {
      const instrument = await this.instrumentService.getById(config.instrumentId);
      if (instrument.status !== 'active') {
        throw new BadRequestException('Selected market is not currently tradable');
      }
      if (typeof config.currency === 'string' && config.currency !== instrument.quoteCurrency) {
        throw new BadRequestException(`This market only supports ${instrument.quoteCurrency}`);
      }
    }

    return config;
  }

  /**
   * Realized P/L only — open bets contribute nothing (never estimated),
   * matching `reports.service.ts`'s revenue-aggregate pattern: sum as a
   * SQL string per status, combine into an exact `bigint` in JS.
   */
  private async computeStats(botId: string): Promise<BotStats> {
    const [logCount] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(tradingBotLogs)
      .where(eq(tradingBotLogs.botId, botId));
    const [tradeCount] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(bets)
      .where(eq(bets.botId, botId));
    const settledRows = await this.db
      .select({
        status: bets.status,
        stakeSum: sql<string>`coalesce(sum(${bets.stakeAmount}), 0)`,
        payoutSum: sql<string>`coalesce(sum(${bets.potentialPayout}), 0)`,
      })
      .from(bets)
      .where(and(eq(bets.botId, botId), inArray(bets.status, ['won', 'lost'])))
      .groupBy(bets.status);

    let totalPnl = 0n;
    for (const row of settledRows) {
      const stake = BigInt(row.stakeSum);
      totalPnl += row.status === 'won' ? BigInt(row.payoutSum) - stake : -stake;
    }

    return { totalExecutions: logCount?.count ?? 0, totalTrades: tradeCount?.count ?? 0, totalPnl };
  }

  private async computeWeeklyReturnPercent(botIds: string[]): Promise<number | null> {
    const since = new Date(Date.now() - WEEK_MS);
    const rows = await this.db
      .select({
        status: bets.status,
        stakeSum: sql<string>`coalesce(sum(${bets.stakeAmount}), 0)`,
        payoutSum: sql<string>`coalesce(sum(${bets.potentialPayout}), 0)`,
      })
      .from(bets)
      .where(and(inArray(bets.botId, botIds), inArray(bets.status, ['won', 'lost']), gte(bets.settledAt, since)))
      .groupBy(bets.status);

    let pnl = 0n;
    let stakeTotal = 0n;
    for (const row of rows) {
      const stake = BigInt(row.stakeSum);
      stakeTotal += stake;
      pnl += row.status === 'won' ? BigInt(row.payoutSum) - stake : -stake;
    }
    if (stakeTotal === 0n) return null;
    // Basis-points precision, then scaled down to a plain percentage — avoids floating-point division of bigints.
    return Number((pnl * 10_000n) / stakeTotal) / 100;
  }
}
