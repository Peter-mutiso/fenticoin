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
}

export interface StrategyProvider {
  readonly key: string;
  evaluate(context: StrategyContext): Promise<StrategySignal | null>;
}

export const BOT_STRATEGY_PROVIDERS = Symbol('BOT_STRATEGY_PROVIDERS');