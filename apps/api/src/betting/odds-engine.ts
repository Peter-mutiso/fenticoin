import { Injectable } from '@nestjs/common';
import { Money } from '@fenticoin/domain';

/**
 * Pure payout math — deliberately tiny and framework-free. The browser
 * never computes this: `BettingService` calls it server-side using the
 * `payoutRateBasisPoints` snapshotted from the admin-configured
 * `betting_configs` row at placement time.
 */
@Injectable()
export class OddsEngine {
  /** `payoutRateBasisPoints` is a *profit* rate (8500 = 85% profit on the stake), not a total multiplier. */
  calculatePotentialPayout(stake: Money, payoutRateBasisPoints: bigint): Money {
    const profit = stake.applyBasisPoints(payoutRateBasisPoints, 'floor');
    return stake.add(profit);
  }
}
