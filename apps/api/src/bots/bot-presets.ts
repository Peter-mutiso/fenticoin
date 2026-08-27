import type { ExecutionIntervalSeconds } from './execution-interval';
import type { StrategyRiskLevel } from './strategy-catalog';

/**
 * "Recommended Bots" shown on the `/bots` marketplace — each one is a
 * named, pre-filled *configuration* of a real strategy in
 * `strategy-catalog.ts`, never a separate implementation. This is a
 * deliberate, honest simplification: FentiCoin only has two real,
 * deterministic bot strategies today (`dca_recurring`, `momentum_rsi`).
 * Rather than fabricate distinct "intelligent" algorithms for every
 * marketing-style name a trading product might want, each preset maps to
 * one of those two real strategies with different (still fully
 * deterministic, still server-side) parameters — e.g. "Short-Term
 * Momentum" is the same real RSI engine as "Conservative Trend", just
 * checked far more often against tighter thresholds. Selecting a preset
 * only pre-fills `NewBotForm`; the user still reviews and can change
 * every field, and the bot that gets created is configured and validated
 * through the exact same `BotService.create` path as a from-scratch bot.
 *
 * No "Volatility Breakout" preset is defined here: there is no real
 * server-side volatility-breakout signal in this codebase, and inventing
 * one just to fill out a marketing list would violate this feature's own
 * "every predefined bot must map to an actual deterministic strategy"
 * requirement.
 */
export interface BotPreset {
  key: string;
  name: string;
  strategyKey: string;
  riskLevel: StrategyRiskLevel;
  executionIntervalSeconds: ExecutionIntervalSeconds;
  /** Display-only hint (e.g. "BTC/USD") — `NewBotForm` uses it to preselect a matching instrument if one exists, but never assumes it does. */
  recommendedInstrumentSymbol?: string;
  description: string;
  /** Pre-fills `BotConfigForm`'s values for every field except `instrumentId`/`currency`, which always come from the market the user picks. */
  defaultConfig: Record<string, unknown>;
}

export const BOT_PRESETS: BotPreset[] = [
  {
    key: 'dca_momentum',
    name: 'DCA Momentum',
    strategyKey: 'dca_recurring',
    riskLevel: 'low',
    executionIntervalSeconds: 3600,
    recommendedInstrumentSymbol: 'BTCUSD',
    description: 'A systematic, non-predictive schedule: places a fixed-size bet on a fixed direction every hour, regardless of price.',
    defaultConfig: { selection: 'rise', durationSeconds: 300 },
  },
  {
    key: 'trend_rider',
    name: 'Trend Rider',
    strategyKey: 'momentum_rsi',
    riskLevel: 'medium',
    executionIntervalSeconds: 300,
    recommendedInstrumentSymbol: 'BTCUSD',
    description: 'Rides sustained momentum with a longer RSI window checked every 5 minutes — fewer, higher-conviction signals.',
    defaultConfig: { rsiPeriod: 21, oversoldThreshold: 35, overboughtThreshold: 65, durationSeconds: 300 },
  },
  {
    key: 'short_term_momentum',
    name: 'Short-Term Momentum',
    strategyKey: 'momentum_rsi',
    riskLevel: 'high',
    executionIntervalSeconds: 15,
    recommendedInstrumentSymbol: 'ETHUSD',
    description: 'A fast, tightly-wound real RSI reading checked every 15 seconds for quick momentum bursts. Higher frequency, higher risk.',
    defaultConfig: { rsiPeriod: 7, oversoldThreshold: 25, overboughtThreshold: 75, durationSeconds: 30 },
  },
  {
    key: 'mean_reversion',
    name: 'Mean Reversion',
    strategyKey: 'momentum_rsi',
    riskLevel: 'medium',
    executionIntervalSeconds: 60,
    recommendedInstrumentSymbol: 'BTCUSD',
    description: 'The standard RSI mean-reversion read — bets on a bounce after oversold dips and a pullback after overbought spikes.',
    defaultConfig: { rsiPeriod: 14, oversoldThreshold: 30, overboughtThreshold: 70, durationSeconds: 60 },
  },
  {
    key: 'conservative_trend',
    name: 'Conservative Trend',
    strategyKey: 'momentum_rsi',
    riskLevel: 'low',
    executionIntervalSeconds: 1800,
    recommendedInstrumentSymbol: 'BTCUSD',
    description: 'Wide oversold/overbought bands checked every 30 minutes — trades rarely, only on strong, real momentum extremes.',
    defaultConfig: { rsiPeriod: 21, oversoldThreshold: 20, overboughtThreshold: 80, durationSeconds: 900 },
  },
];
