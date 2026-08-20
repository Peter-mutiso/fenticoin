/**
 * A recurring weekly open window, in UTC. `dayOfWeek` follows
 * `Date#getUTCDay()` (0 = Sunday .. 6 = Saturday). `opensAt`/`closesAt`
 * are `HH:MM` 24-hour UTC times. An instrument with `tradingSchedule =
 * null` is always open (crypto, today) — this type only matters once a
 * non-24/7 asset class (forex, stocks) is added.
 */
export interface MarketSessionWindow {
  dayOfWeek: number;
  opensAt: string;
  closesAt: string;
}

export type MarketSessionSchedule = MarketSessionWindow[];

function parseHhMm(value: string): number {
  const [h, m] = value.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/** Pure function: given a schedule (or null for 24/7) and a point in time, is the market open? */
export function isWithinTradingSession(schedule: MarketSessionSchedule | null, at: Date): boolean {
  if (schedule === null || schedule.length === 0) return true;

  const dayOfWeek = at.getUTCDay();
  const minutesOfDay = at.getUTCHours() * 60 + at.getUTCMinutes();

  return schedule.some((window) => {
    if (window.dayOfWeek !== dayOfWeek) return false;
    const opens = parseHhMm(window.opensAt);
    const closes = parseHhMm(window.closesAt);
    return minutesOfDay >= opens && minutesOfDay < closes;
  });
}
