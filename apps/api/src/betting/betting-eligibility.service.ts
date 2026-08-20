import { ForbiddenException, Injectable } from '@nestjs/common';

import type { User } from '../database/schema';

/**
 * "Is this account allowed to bet at all" — separate from "is this
 * specific bet valid" (stake bounds, market open, etc., which
 * `BettingService` checks itself). Account-status suspension is already
 * enforced globally by `AuthGuard` before a request even reaches a
 * controller; this checks the *betting-specific* eligibility signals
 * that a merely-active account doesn't automatically satisfy.
 */
@Injectable()
export class BettingEligibilityService {
  assertCanBet(user: Pick<User, 'eligibilityStatus' | 'kycStatus'>): void {
    if (user.eligibilityStatus === 'ineligible') {
      throw new ForbiddenException('This account is not eligible to place bets');
    }
    // KYC gating deliberately stops at "not rejected" for now — the
    // tiered-limit policy (how much you can wager before full KYC is
    // required) is a compliance decision tracked as an open question in
    // docs/ARCHITECTURE.md, not something to invent here.
    if (user.kycStatus === 'rejected') {
      throw new ForbiddenException('This account cannot place bets while KYC is rejected');
    }
  }
}
