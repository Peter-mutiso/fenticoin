import { ForbiddenException, Injectable } from '@nestjs/common';

import type { User } from '../database/schema';

/**
 * Mirrors `WithdrawalEligibilityService` (no KYC requirement — deposits are
 * money coming IN, not out, so the stricter identity-verification bar that
 * withdrawals require doesn't apply here). `AuthGuard` already rejects
 * non-active accounts before any handler runs; the status check here is
 * defense in depth, not the primary guard.
 */
@Injectable()
export class DepositEligibilityService {
  assertCanDeposit(user: User): void {
    if (user.accountType === 'demo') {
      throw new ForbiddenException('Demo accounts cannot make real-money deposits');
    }
    if (user.status !== 'active') {
      throw new ForbiddenException(`Account is ${user.status} and cannot deposit funds`);
    }
    if (user.eligibilityStatus === 'ineligible') {
      throw new ForbiddenException('Account is not eligible to deposit funds');
    }
  }
}
