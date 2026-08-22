import { ConflictException } from '@nestjs/common';

import type { DepositStatus } from '../database/schema';

/**
 * `pending` is the only non-terminal state. A deposit reaches
 * `completed` exactly once, only via the atomic claim in
 * `DepositService` — never by a webhook payload or client claim alone.
 */
const LEGAL_TRANSITIONS: Record<DepositStatus, DepositStatus[]> = {
  pending: ['completed', 'failed', 'cancelled', 'expired'],
  completed: [],
  failed: [],
  cancelled: [],
  expired: [],
};

export function isLegalDepositTransition(from: DepositStatus, to: DepositStatus): boolean {
  return LEGAL_TRANSITIONS[from].includes(to);
}

export function assertLegalDepositTransition(from: DepositStatus, to: DepositStatus): void {
  if (!isLegalDepositTransition(from, to)) {
    throw new ConflictException(`Illegal deposit status transition: ${from} -> ${to}`);
  }
}
