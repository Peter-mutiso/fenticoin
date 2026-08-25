import { ForbiddenException, Injectable } from '@nestjs/common';

import type { User } from '../database/schema';

/**
 * Withdrawing real money out of the platform is held to a stricter bar
 * than placing a bet (compare `BettingEligibilityService`): KYC must be
 * fully `approved`, not merely "not rejected" — sending funds to an
 * unverified identity is exactly the kind of thing KYC exists to gate.
 * `AuthGuard` already rejects non-active accounts before any handler
 * runs; the status check here is defense in depth, not the primary guard.
 */
@Injectable()
export class WithdrawalEligibilityService {
  assertCanWithdraw(user: User): void {
    if (user.status !== 'active') {
      throw new ForbiddenException(`Account is ${user.status} and cannot withdraw funds`);
    }
    if (user.eligibilityStatus === 'ineligible') {
      throw new ForbiddenException('Account is not eligible to withdraw funds');
    }
    if (user.kycStatus !== 'approved') {
      throw new ForbiddenException('Identity verification must be approved before withdrawing funds');
    }
  }
}
