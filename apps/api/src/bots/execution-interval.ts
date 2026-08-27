/**
 * The single, canonical set of execution intervals a bot may run at —
 * shared by every strategy (previously each strategy invented its own ad
 * hoc interval concept: `dca_recurring` used a `daily`/`weekly`/`monthly`
 * config field, `momentum_rsi` used a freeform 15–3600s number). Standing
 * this up as one bot-level field (`bots.executionIntervalSeconds`) means:
 *  - the backend validates against one real, finite list (not "any
 *    integer in a range"), matching how every other financial input in
 *    this codebase is validated against an explicit allow-list;
 *  - `BotExecutionService` can honor the interval the same way for every
 *    strategy, via the same deterministic elapsed-time bucketing that
 *    `dedupeKey`/idempotency already relies on — no strategy needs its own
 *    copy of that logic.
 *
 * Values are in whole seconds so they compose directly with `Date` math
 * and with `StrategySignal.durationSeconds`'s own unit.
 */
export const ALLOWED_EXECUTION_INTERVAL_SECONDS = [
  5, 10, 15, 30, 45, // seconds
  60, 120, 300, 600, 900, 1800, 3600, // 1, 2, 5, 10, 15, 30, 60 minutes
] as const;

export type ExecutionIntervalSeconds = (typeof ALLOWED_EXECUTION_INTERVAL_SECONDS)[number];

export const DEFAULT_EXECUTION_INTERVAL_SECONDS: ExecutionIntervalSeconds = 300;

export function isAllowedExecutionIntervalSeconds(value: unknown): value is ExecutionIntervalSeconds {
  return typeof value === 'number' && (ALLOWED_EXECUTION_INTERVAL_SECONDS as readonly number[]).includes(value);
}

/** "5 seconds" / "1 minute" / "30 minutes" — used in bot cards/detail pages and log messages. */
export function formatExecutionInterval(seconds: number): string {
  if (seconds < 60) return `${seconds} second${seconds === 1 ? '' : 's'}`;
  const minutes = seconds / 60;
  return `${minutes} minute${minutes === 1 ? '' : 's'}`;
}
