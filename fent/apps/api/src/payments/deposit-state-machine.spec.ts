import { ConflictException } from '@nestjs/common';

import { assertLegalDepositTransition, isLegalDepositTransition } from './deposit-state-machine';

describe('deposit state machine', () => {
  it('allows pending to move to any terminal outcome', () => {
    expect(isLegalDepositTransition('pending', 'completed')).toBe(true);
    expect(isLegalDepositTransition('pending', 'failed')).toBe(true);
    expect(isLegalDepositTransition('pending', 'cancelled')).toBe(true);
    expect(isLegalDepositTransition('pending', 'expired')).toBe(true);
  });

  it('treats every terminal status as final — no transitions out, including re-completion', () => {
    expect(isLegalDepositTransition('completed', 'completed')).toBe(false);
    expect(isLegalDepositTransition('completed', 'failed')).toBe(false);
    expect(isLegalDepositTransition('failed', 'pending')).toBe(false);
    expect(isLegalDepositTransition('cancelled', 'completed')).toBe(false);
    expect(isLegalDepositTransition('expired', 'completed')).toBe(false);
  });

  it('assertLegalDepositTransition throws ConflictException for an illegal transition', () => {
    expect(() => assertLegalDepositTransition('completed', 'failed')).toThrow(ConflictException);
  });

  it('assertLegalDepositTransition does not throw for a legal transition', () => {
    expect(() => assertLegalDepositTransition('pending', 'completed')).not.toThrow();
  });
});
