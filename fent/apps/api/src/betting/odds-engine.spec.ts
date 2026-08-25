import { Money, USD } from '@fenticoin/domain';

import { OddsEngine } from './odds-engine';

describe('OddsEngine', () => {
  const engine = new OddsEngine();

  it('adds the profit (not a full multiplier) to the stake', () => {
    const stake = Money.fromMinorUnits(1_000n, USD); // 10.00
    const payout = engine.calculatePotentialPayout(stake, 8_500n); // 85% profit

    expect(payout.toMinorUnits()).toBe(1_850n); // 10.00 stake + 8.50 profit = 18.50
  });

  it('floors any fractional minor unit produced by the rate (in the platform favor)', () => {
    const stake = Money.fromMinorUnits(333n, USD);
    const payout = engine.calculatePotentialPayout(stake, 8_500n);

    // 333 * 0.85 = 283.05 -> floors to 283; payout = 333 + 283 = 616
    expect(payout.toMinorUnits()).toBe(616n);
  });

  it('never produces a payout less than the stake for a positive rate', () => {
    const stake = Money.fromMinorUnits(500n, USD);
    const payout = engine.calculatePotentialPayout(stake, 1n); // tiny but positive rate
    expect(payout.compareTo(stake)).toBeGreaterThanOrEqual(0);
  });
});
