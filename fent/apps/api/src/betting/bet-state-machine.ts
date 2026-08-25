import { ConflictException } from '@nestjs/common';

import type { BetStatus } from '../database/schema';

/**
 * The complete legal-transition table. Anything not listed here is
 * forbidden — in particular, a terminal status (`won`, `lost` outside of
 * a dispute; `void`, `cancelled`, `refunded` always) can never move
 * again, which is what makes "a settled bet must not be settled again" a
 * property enforced by this table rather than by scattered `if` checks.
 */
const LEGAL_TRANSITIONS: Record<BetStatus, BetStatus[]> = {
  open: ['pending', 'cancelled'],
  // "pending" = claimed for settlement (a very short-lived lock state) —
  // see SettlementService.claim. 'open' covers releasing a retryable
  // failed attempt; 'requires_review' covers giving up after repeated
  // failures (see SettlementService.handleSettlementFailure).
  pending: ['won', 'lost', 'void', 'open', 'requires_review'],
  won: ['disputed'],
  lost: ['disputed'],
  disputed: ['won', 'lost', 'refunded'],
  // A human resolves this out of band — see SettlementService.resolveManualReview.
  requires_review: ['won', 'lost', 'void', 'cancelled', 'refunded'],
  void: [],
  cancelled: [],
  refunded: [],
};

export function isLegalBetTransition(from: BetStatus, to: BetStatus): boolean {
  return LEGAL_TRANSITIONS[from].includes(to);
}

export function assertLegalBetTransition(from: BetStatus, to: BetStatus): void {
  if (!isLegalBetTransition(from, to)) {
    throw new ConflictException(`Illegal bet status transition: ${from} -> ${to}`);
  }
}
