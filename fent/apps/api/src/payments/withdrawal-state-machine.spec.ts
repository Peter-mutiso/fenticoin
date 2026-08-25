import { ConflictException } from '@nestjs/common';

import { assertLegalWithdrawalTransition, isLegalWithdrawalTransition } from './withdrawal-state-machine';

describe('withdrawal state machine', () => {
  it('allows the full happy-path review-to-settlement sequence', () => {
    expect(isLegalWithdrawalTransition('pending_review', 'approved')).toBe(true);
    expect(isLegalWithdrawalTransition('approved', 'submitted')).toBe(true);
    expect(isLegalWithdrawalTransition('submitted', 'completed')).toBe(true);
  });

  it('allows rejection at review, and failure at submission or settlement', () => {
    expect(isLegalWithdrawalTransition('pending_review', 'rejected')).toBe(true);
    expect(isLegalWithdrawalTransition('approved', 'failed')).toBe(true);
    expect(isLegalWithdrawalTransition('submitted', 'failed')).toBe(true);
  });

  it('allows reversing a completed withdrawal', () => {
    expect(isLegalWithdrawalTransition('completed', 'reversed')).toBe(true);
  });

  it('never allows settling straight from pending_review, skipping review and submission', () => {
    expect(isLegalWithdrawalTransition('pending_review', 'completed')).toBe(false);
    expect(isLegalWithdrawalTransition('pending_review', 'submitted')).toBe(false);
  });

  it('treats rejected/failed/reversed as terminal', () => {
    expect(isLegalWithdrawalTransition('rejected', 'approved')).toBe(false);
    expect(isLegalWithdrawalTransition('failed', 'submitted')).toBe(false);
    expect(isLegalWithdrawalTransition('reversed', 'completed')).toBe(false);
  });

  it('never allows completing an already-completed withdrawal a second time', () => {
    expect(isLegalWithdrawalTransition('completed', 'completed')).toBe(false);
  });

  it('assertLegalWithdrawalTransition throws ConflictException for an illegal transition', () => {
    expect(() => assertLegalWithdrawalTransition('completed', 'completed')).toThrow(ConflictException);
  });

  it('assertLegalWithdrawalTransition does not throw for a legal transition', () => {
    expect(() => assertLegalWithdrawalTransition('pending_review', 'approved')).not.toThrow();
  });
});
