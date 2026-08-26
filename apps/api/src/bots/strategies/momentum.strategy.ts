import { Inject, Injectable } from '@nestjs/common';
import { desc, eq } from 'drizzle-orm';

import { DRIZZLE_CLIENT } from '../../database/database.constants';
import type { DrizzleDb } from '../../database/database.types';
import { priceTicks } from '../../database/schema';
import type { StrategyContext, StrategyProvider, StrategySignal } from '../strategy.interface';

interface MomentumConfig {
  instrumentId: string;
  stakeAmount: string;
  currency: string;
  durationSeconds: number;
  rsiPeriod?: number;
  oversoldThreshold?: number;
  overboughtThreshold?: number;
  evaluationIntervalSeconds?: number;
}

const DEFAULTS = {
  rsiPeriod: 14,
  oversoldThreshold: 30,
  overboughtThreshold: 70,
  evaluationIntervalSeconds: 60,
};

/**
 * A real, deterministic momentum strategy: computes RSI from the
 * instrument's actual recorded `price_ticks` history and signals only
 * when it crosses a configured threshold. Never random. `dedupeKey` is a
 * time bucket derived from `evaluationIntervalSeconds`, so however often
 * the scheduler ticks, the strategy is only ever evaluated into a real
 * bet once per window.
 */
@Injectable()
export class MomentumStrategy implements StrategyProvider {
  readonly key = 'momentum_rsi';

  constructor(@Inject(DRIZZLE_CLIENT) private readonly db: DrizzleDb) {}

  async evaluate(context: StrategyContext): Promise<StrategySignal | null> {
    const config = context.bot.config as unknown as Partial<MomentumConfig>;
    if (!config.instrumentId || !config.stakeAmount || !config.currency) return null;

    const period = config.rsiPeriod ?? DEFAULTS.rsiPeriod;
    const oversold = config.oversoldThreshold ?? DEFAULTS.oversoldThreshold;
    const overbought = config.overboughtThreshold ?? DEFAULTS.overboughtThreshold;
    const evaluationIntervalSeconds = config.evaluationIntervalSeconds ?? DEFAULTS.evaluationIntervalSeconds;

    const rows = await this.db
      .select({ price: priceTicks.price })
      .from(priceTicks)
      .where(eq(priceTicks.instrumentId, config.instrumentId))
      .orderBy(desc(priceTicks.observedAt))
      .limit(period + 1);
    if (rows.length < period + 1) return null; // not enough real history yet — no fabricated signal

    const chronological = rows.map((row) => Number(row.price)).reverse();
    let gainTotal = 0;
    let lossTotal = 0;
    for (let i = 1; i < chronological.length; i += 1) {
      const current = chronological[i];
      const previous = chronological[i - 1];
      if (current === undefined || previous === undefined) continue;
      const delta = current - previous;
      if (delta > 0) gainTotal += delta;
      else lossTotal += -delta;
    }
    const avgGain = gainTotal / period;
    const avgLoss = lossTotal / period;
    const rsi = avgLoss === 0 ? (avgGain === 0 ? 50 : 100) : 100 - 100 / (1 + avgGain / avgLoss);

    const bucketIndex = Math.floor(context.now.getTime() / 1000 / evaluationIntervalSeconds);
    let selection: 'rise' | 'fall' | null = null;
    if (rsi < oversold) selection = 'rise';
    else if (rsi > overbought) selection = 'fall';
    if (!selection) return null;

    return {
      instrumentId: config.instrumentId,
      type: 'rise_fall',
      selection,
      stakeAmount: BigInt(config.stakeAmount),
      currency: config.currency,
      durationSeconds: config.durationSeconds ?? 60,
      dedupeKey: `momentum:${bucketIndex}`,
    };
  }
}
