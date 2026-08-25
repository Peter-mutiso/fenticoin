import { isWithinTradingSession } from './market-session';

describe('isWithinTradingSession', () => {
  it('is always open when the schedule is null (24/7, e.g. crypto)', () => {
    expect(isWithinTradingSession(null, new Date('2026-01-05T03:00:00Z'))).toBe(true); // a Monday, 3am
  });

  it('is always open when the schedule is an empty array', () => {
    expect(isWithinTradingSession([], new Date('2026-01-05T03:00:00Z'))).toBe(true);
  });

  it('is open within a configured window on the matching day', () => {
    // 2026-01-05 is a Monday (dayOfWeek 1).
    const schedule = [{ dayOfWeek: 1, opensAt: '09:00', closesAt: '17:00' }];
    expect(isWithinTradingSession(schedule, new Date('2026-01-05T12:00:00Z'))).toBe(true);
  });

  it('is closed before the opening time', () => {
    const schedule = [{ dayOfWeek: 1, opensAt: '09:00', closesAt: '17:00' }];
    expect(isWithinTradingSession(schedule, new Date('2026-01-05T08:59:00Z'))).toBe(false);
  });

  it('is closed at/after the closing time (half-open interval)', () => {
    const schedule = [{ dayOfWeek: 1, opensAt: '09:00', closesAt: '17:00' }];
    expect(isWithinTradingSession(schedule, new Date('2026-01-05T17:00:00Z'))).toBe(false);
  });

  it('is closed on a day not covered by the schedule', () => {
    const schedule = [{ dayOfWeek: 1, opensAt: '09:00', closesAt: '17:00' }];
    // 2026-01-06 is a Tuesday.
    expect(isWithinTradingSession(schedule, new Date('2026-01-06T12:00:00Z'))).toBe(false);
  });

  it('supports multiple windows across different days', () => {
    const schedule = [
      { dayOfWeek: 1, opensAt: '09:00', closesAt: '17:00' },
      { dayOfWeek: 3, opensAt: '10:00', closesAt: '14:00' },
    ];
    expect(isWithinTradingSession(schedule, new Date('2026-01-07T11:00:00Z'))).toBe(true); // Wednesday
    expect(isWithinTradingSession(schedule, new Date('2026-01-07T15:00:00Z'))).toBe(false);
  });
});
