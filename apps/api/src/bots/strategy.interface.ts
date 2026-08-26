import type { BetType, Bot } from '../database/schema';

export interface StrategyContext {
  bot: Bot;
  now: Date;
}

export interface StrategySignal {
  instrumentId: string;
  type: BetType;
  selection: string;
  targetPrice?: string;
  stakeAmount: bigint;
  currency: string;
  durationSeconds: number;
  /**
   * A deterministic identifier for "which schedule/decision slot this
   * signal belongs to" (e.g. a DCA interval index, or a momentum
   * evaluation window) — folded into the bet's idempotency key so that
   * two overlapping scheduler passes for the same bot/slot can never
   * place two bets. Strategies should always set this; when absent,
   * `BotExecutionService` falls back to the current timestamp, which is
   * only safe under a single scheduler instance.
   */
  dedupeKey?: string;
}

export interface StrategyProvider {
  readonly key: string;
  evaluate(context: StrategyContext): Promise<StrategySignal | null>;
}

export const BOT_STRATEGY_PROVIDERS = Symbol('BOT_STRATEGY_PROVIDERS');