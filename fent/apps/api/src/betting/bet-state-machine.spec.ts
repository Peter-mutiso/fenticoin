import { ConflictException } from '@nestjs/common';

import { assertLegalBetTransition, isLegalBetTransition } from './bet-state-machine';

describe('bet state machine', () => {
  it('allows the full happy-path settlement sequence', () => {
    expect(isLegalBetTransition('open', 'pending')).toBe(true);
    expect(isLegalBetTransition('pending', 'won')).toBe(true);
    expect(isLegalBetTransition('pending', 'lost')).toBe(true);
    expect(isLegalBetTransition('pending', 'void')).toBe(true);
  });

  it('allows admin cancellation from open', () => {
    expect(isLegalBetTransition('open', 'cancelled')).toBe(true);
  });

  it('allows a claim to be released back to open', () => {
    expect(isLegalBetTransition('pending', 'open')).toBe(true);
  });

  it('allows disputing a won or lost bet, and resolving a dispute', () => {
    expect(isLegalBetTransition('won', 'disputed')).toBe(true);
    expect(isLegalBetTransition('lost', 'disputed')).toBe(true);
    expect(isLegalBetTransition('disputed', 'won')).toBe(true);
    expect(isLegalBetTransition('disputed', 'lost')).toBe(true);
    expect(isLegalBetTransition('disputed', 'refunded')).toBe(true);
  });

  it('never allows a settled bet to be settled again', () => {
    expect(isLegalBetTransition('won', 'won')).toBe(false);
    expect(isLegalBetTransition('lost', 'lost')).toBe(false);
    expect(isLegalBetTransition('won', 'pending')).toBe(false);
    expect(isLegalBetTransition('lost', 'pending')).toBe(false);
  });

  it('treats void/cancelled/refunded as terminal — no transitions out', () => {
    expect(isLegalBetTransition('void', 'open')).toBe(false);
    expect(isLegalBetTransition('cancelled', 'open')).toBe(false);
    expect(isLegalBetTransition('refunded', 'open')).toBe(false);
    expect(isLegalBetTransition('void', 'won')).toBe(false);
  });

  it('rejects placing an open bet straight to won without going through pending', () => {
    expect(isLegalBetTransition('open', 'won')).toBe(false);
  });

  it('assertLegalBetTransition throws ConflictException for an illegal transition', () => {
    expect(() => assertLegalBetTransition('won', 'lost')).toThrow(ConflictException);
  });

  it('assertLegalBetTransition does not throw for a legal transition', () => {
    expect(() => assertLegalBetTransition('open', 'pending')).not.toThrow();
  });

  it('allows routing a repeatedly-failing settlement attempt to manual review', () => {
    expect(isLegalBetTransition('pending', 'requires_review')).toBe(true);
  });

  it('allows an admin to resolve a manual review to any final outcome', () => {
    expect(isLegalBetTransition('requires_review', 'won')).toBe(true);
    expect(isLegalBetTransition('requires_review', 'lost')).toBe(true);
    expect(isLegalBetTransition('requires_review', 'void')).toBe(true);
    expect(isLegalBetTransition('requires_review', 'cancelled')).toBe(true);
    expect(isLegalBetTransition('requires_review', 'refunded')).toBe(true);
  });

  it('never allows settling straight into requires_review from open', () => {
    expect(isLegalBetTransition('open', 'requires_review')).toBe(false);
  });
});
