import { ForbiddenException } from '@nestjs/common';

import type { User } from '../database/schema';
import { DepositEligibilityService } from './deposit-eligibility.service';

function user(overrides: Partial<User> = {}): User {
  return {
    id: 'user-1',
    status: 'active',
    eligibilityStatus: 'eligible',
    kycStatus: 'unverified',
    accountType: 'real',
    ...overrides,
  } as User;
}

describe('DepositEligibilityService', () => {
  const service = new DepositEligibilityService();

  it('allows an active, eligible user regardless of KYC status', () => {
    expect(() => service.assertCanDeposit(user())).not.toThrow();
    expect(() => service.assertCanDeposit(user({ kycStatus: 'unverified' }))).not.toThrow();
  });

  it('rejects a non-active account', () => {
    expect(() => service.assertCanDeposit(user({ status: 'suspended' }))).toThrow(ForbiddenException);
  });

  it('rejects an ineligible account', () => {
    expect(() => service.assertCanDeposit(user({ eligibilityStatus: 'ineligible' }))).toThrow(ForbiddenException);
  });

  it('rejects a demo account regardless of status/eligibility/KYC', () => {
    expect(() => service.assertCanDeposit(user({ accountType: 'demo' }))).toThrow(ForbiddenException);
  });
});
