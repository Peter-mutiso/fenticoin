import { ForbiddenException } from '@nestjs/common';

import type { User } from '../database/schema';
import { WithdrawalEligibilityService } from './withdrawal-eligibility.service';

function user(overrides: Partial<User> = {}): User {
  return {
    id: 'user-1',
    status: 'active',
    eligibilityStatus: 'eligible',
    kycStatus: 'approved',
    accountType: 'real',
    ...overrides,
  } as User;
}

describe('WithdrawalEligibilityService', () => {
  const service = new WithdrawalEligibilityService();

  it('allows an active, eligible, KYC-approved user', () => {
    expect(() => service.assertCanWithdraw(user())).not.toThrow();
  });

  it('rejects a non-active account', () => {
    expect(() => service.assertCanWithdraw(user({ status: 'suspended' }))).toThrow(ForbiddenException);
  });

  it('rejects an ineligible account', () => {
    expect(() => service.assertCanWithdraw(user({ eligibilityStatus: 'ineligible' }))).toThrow(ForbiddenException);
  });

  it('rejects unless KYC is fully approved — "not rejected" is not enough for a withdrawal', () => {
    expect(() => service.assertCanWithdraw(user({ kycStatus: 'unverified' }))).toThrow(ForbiddenException);
    expect(() => service.assertCanWithdraw(user({ kycStatus: 'pending' }))).toThrow(ForbiddenException);
    expect(() => service.assertCanWithdraw(user({ kycStatus: 'rejected' }))).toThrow(ForbiddenException);
  });

  it('rejects a demo account regardless of status/eligibility/KYC', () => {
    expect(() => service.assertCanWithdraw(user({ accountType: 'demo' }))).toThrow(ForbiddenException);
  });
});
