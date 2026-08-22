import { ConflictException } from '@nestjs/common';

import type { WithdrawalStatus } from '../database/schema';

/**
 * pending_review -> approved | rejected
 * approved -> submitted | failed (provider submission itself can fail)
 * submitted -> completed | failed
 * completed -> reversed (admin-initiated, after the fact)
 * `rejected`, `failed`, `reversed` are terminal; so is `completed` unless reversed.
 */
const LEGAL_TRANSITIONS: Record<WithdrawalStatus, WithdrawalStatus[]> = {
  pending_review: ['approved', 'rejected'],
  approved: ['submitted', 'failed'],
  submitted: ['completed', 'failed'],
  completed: ['reversed'],
  rejected: [],
  failed: [],
  reversed: [],
};

export function isLegalWithdrawalTransition(from: WithdrawalStatus, to: WithdrawalStatus): boolean {
  return LEGAL_TRANSITIONS[from].includes(to);
}

export function assertLegalWithdrawalTransition(from: WithdrawalStatus, to: WithdrawalStatus): void {
  if (!isLegalWithdrawalTransition(from, to)) {
    throw new ConflictException(`Illegal withdrawal status transition: ${from} -> ${to}`);
  }
}
