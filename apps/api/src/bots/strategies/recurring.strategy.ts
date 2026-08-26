import { Injectable } from '@nestjs/common';

import type { StrategyContext, StrategyProvider, StrategySignal } from '../strategy.interface';

interface RecurringConfig {
  instrumentId: string;
  selection: 'rise' | 'fall';
  stakeAmount: string;
  currency: string;
  intervalUnit: 'daily' | 'weekly' | 'monthly';
  durationSeconds: number;
}

const INTERVAL_MS: Record<RecurringConfig['intervalUnit'], number> = {
  daily: 24 * 60 * 60 * 1000,
  weekly: 7 * 24 * 60 * 60 * 1000,
  // A fixed 30-day bucket rather than a calendar month — simpler and
  // still fully deterministic from (createdAt, now) alone.
  monthly: 30 * 24 * 60 * 60 * 1000,
};

/**
 * The "Dollar-Cost Averaging" strategy, reinterpreted honestly for a
 * bet-based trading engine: it places a fixed-size bet on a fixed
 * direction at a fixed cadence, purely on schedule — never predicting
 * price. `dedupeKey` is the interval index since the bot's activation,
 * so however many times the scheduler evaluates this bot within one
 * interval, only the first evaluation results in a bet.
 */
@Injectable()
export class RecurringStrategy implements StrategyProvider {
  readonly key = 'dca_recurring';

  async evaluate(context: StrategyContext): Promise<StrategySignal | null> {
    const config = context.bot.config as unknown as Partial<RecurringConfig>;
    if (!config.instrumentId || !config.selection || !config.stakeAmount || !config.currency || !config.intervalUnit) {
      return null;
    }
    const elapsedMs = context.now.getTime() - context.bot.createdAt.getTime();
    if (elapsedMs < 0) return null;
    const bucketIndex = Math.floor(elapsedMs / INTERVAL_MS[config.intervalUnit]);

    return {
      instrumentId: config.instrumentId,
      type: 'rise_fall',
      selection: config.selection,
      stakeAmount: BigInt(config.stakeAmount),
      currency: config.currency,
      durationSeconds: config.durationSeconds ?? 60,
      dedupeKey: `dca:${bucketIndex}`,
    };
  }
}
