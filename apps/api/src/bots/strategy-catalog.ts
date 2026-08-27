/**
 * The static list of strategies a user can configure a bot with — the
 * single source of truth for both the frontend (renders strategy cards
 * and generates the configuration form from `configFields`) and
 * `BotService.create`/`update` (validates a submitted `config` against
 * the matching entry's fields). Mirrors the pattern in
 * `authorization/permissions.catalog.ts`: a plain TS array, not a
 * database table, because it changes only with a deploy, not at runtime.
 *
 * `dca_recurring` and `momentum_rsi` are real, fully wired strategies
 * (see `strategies/`). `grid_trading` is catalog-only (`comingSoon`) —
 * FentiCoin's only tradable primitive is a timed directional bet, and
 * grid trading (buy/sell across preset price bands) does not map onto
 * that without further product design, so it is shown for visual
 * completeness but cannot be created.
 *
 * Execution cadence is deliberately NOT one of `configFields` for any
 * entry here: it used to be a bespoke per-strategy field (`intervalUnit`
 * for the recurring strategy, `evaluationIntervalSeconds` for momentum),
 * which meant two incompatible ideas of "how often" with two different
 * validation rules. It is now the single bot-level
 * `bots.executionIntervalSeconds` column (see `execution-interval.ts`),
 * shown/edited as its own dedicated control everywhere a bot is
 * configured, and honored identically by every strategy.
 */

export type StrategyCategory = 'dca' | 'momentum' | 'grid';
export type StrategyRiskLevel = 'low' | 'medium' | 'high';

export interface StrategyFieldOption {
  value: string;
  label: string;
}

export interface StrategyConfigField {
  key: string;
  label: string;
  type: 'instrument' | 'currency' | 'select' | 'stake' | 'duration' | 'number';
  required: boolean;
  options?: StrategyFieldOption[];
  min?: number;
  max?: number;
  defaultValue?: number | string;
  helpText?: string;
}

export interface StrategyCatalogEntry {
  key: string;
  name: string;
  category: StrategyCategory;
  description: string;
  riskLevel: StrategyRiskLevel;
  frequencyLabel: string;
  configFields: StrategyConfigField[];
  comingSoon?: boolean;
}

const DIRECTION_OPTIONS: StrategyFieldOption[] = [
  { value: 'rise', label: 'Rise' },
  { value: 'fall', label: 'Fall' },
];

export const STRATEGY_CATALOG: StrategyCatalogEntry[] = [
  {
    key: 'dca_recurring',
    name: 'Recurring strategy',
    category: 'dca',
    description:
      'Places a fixed-size bet on your chosen market and direction at a fixed cadence, regardless of price — a systematic, non-predictive schedule rather than a price forecast.',
    riskLevel: 'low',
    frequencyLabel: 'Configurable — every 5s up to every 60 minutes',
    configFields: [
      { key: 'instrumentId', label: 'Market', type: 'instrument', required: true },
      { key: 'selection', label: 'Direction', type: 'select', required: true, options: DIRECTION_OPTIONS },
      { key: 'stakeAmount', label: 'Stake per execution', type: 'stake', required: true },
      { key: 'currency', label: 'Currency', type: 'currency', required: true },
      {
        key: 'durationSeconds',
        label: 'Bet duration (seconds)',
        type: 'duration',
        required: true,
        min: 30,
        max: 3600,
        defaultValue: 60,
      },
    ],
  },
  {
    key: 'momentum_rsi',
    name: 'Momentum (RSI)',
    category: 'momentum',
    description:
      'Computes a real RSI from recent price history for your chosen market and places a bet only when it crosses your configured oversold or overbought threshold.',
    riskLevel: 'medium',
    frequencyLabel: 'Configurable — every 5s up to every 60 minutes',
    configFields: [
      { key: 'instrumentId', label: 'Market', type: 'instrument', required: true },
      { key: 'stakeAmount', label: 'Stake per execution', type: 'stake', required: true },
      { key: 'currency', label: 'Currency', type: 'currency', required: true },
      {
        key: 'durationSeconds',
        label: 'Bet duration (seconds)',
        type: 'duration',
        required: true,
        min: 30,
        max: 3600,
        defaultValue: 60,
      },
      {
        key: 'rsiPeriod',
        label: 'RSI period',
        type: 'number',
        required: false,
        min: 2,
        max: 50,
        defaultValue: 14,
      },
      {
        key: 'oversoldThreshold',
        label: 'Oversold threshold (buy signal below)',
        type: 'number',
        required: false,
        min: 1,
        max: 49,
        defaultValue: 30,
      },
      {
        key: 'overboughtThreshold',
        label: 'Overbought threshold (sell signal above)',
        type: 'number',
        required: false,
        min: 51,
        max: 99,
        defaultValue: 70,
      },
    ],
  },
  {
    key: 'grid_trading',
    name: 'Grid',
    category: 'grid',
    description:
      "Grid trading isn't available yet — it doesn't map onto FentiCoin's timed-bet trading engine without further product design.",
    riskLevel: 'medium',
    frequencyLabel: 'Not yet available',
    configFields: [],
    comingSoon: true,
  },
];

export function findStrategyCatalogEntry(key: string): StrategyCatalogEntry | undefined {
  return STRATEGY_CATALOG.find((entry) => entry.key === key);
}
