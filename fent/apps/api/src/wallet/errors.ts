import { ConflictException, UnprocessableEntityException } from '@nestjs/common';

/** Thrown when a debit would take a user-owned account below zero. Always caught inside the DB transaction, which rolls back. */
export class InsufficientFundsError extends UnprocessableEntityException {
  constructor(details: { accountId: string; requested: bigint; available: bigint }) {
    super({
      message: 'Insufficient funds',
      code: 'INSUFFICIENT_FUNDS',
      ...details,
      requested: details.requested.toString(),
      available: details.available.toString(),
    });
  }
}

/** Thrown when a set of ledger entries doesn't net to zero per currency — a bug in the caller, never a user-facing scenario. */
export class UnbalancedLedgerEntriesError extends Error {
  constructor(currency: string, debits: bigint, credits: bigint) {
    super(`Ledger entries for ${currency} do not balance: debits=${debits} credits=${credits}`);
    this.name = 'UnbalancedLedgerEntriesError';
  }
}

/** Surfaced when an idempotency key collides mid-flight with a still-in-progress request (rare; the caller should retry). */
export class IdempotencyConflictError extends ConflictException {
  constructor(idempotencyKey: string) {
    super(`A request with idempotency key "${idempotencyKey}" is already being processed`);
  }
}
