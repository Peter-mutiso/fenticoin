import { ForbiddenException } from '@nestjs/common';

import { BettingEligibilityService } from './betting-eligibility.service';

describe('BettingEligibilityService', () => {
  const service = new BettingEligibilityService();

  it('allows an eligible, non-rejected-KYC user', () => {
    expect(() => service.assertCanBet({ eligibilityStatus: 'eligible', kycStatus: 'unverified' })).not.toThrow();
  });

  it('allows an "unknown" eligibility status through (not yet determined, not blocked)', () => {
    expect(() => service.assertCanBet({ eligibilityStatus: 'unknown', kycStatus: 'unverified' })).not.toThrow();
  });

  it('blocks a user explicitly marked ineligible', () => {
    expect(() => service.assertCanBet({ eligibilityStatus: 'ineligible', kycStatus: 'approved' })).toThrow(
      ForbiddenException,
    );
  });

  it('blocks a user with rejected KYC', () => {
    expect(() => service.assertCanBet({ eligibilityStatus: 'eligible', kycStatus: 'rejected' })).toThrow(
      ForbiddenException,
    );
  });
});
