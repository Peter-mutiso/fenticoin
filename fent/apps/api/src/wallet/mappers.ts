import type { Transaction } from '../database/schema';
import type { WalletBalance } from './wallet.service';

/** `bigint` doesn't survive `JSON.stringify` — every wallet API response goes through these. */
export function serializeTransaction(tx: Transaction) {
  return {
    id: tx.id,
    type: tx.type,
    status: tx.status,
    currency: tx.currency,
    totalAmountMinorUnits: tx.totalAmount.toString(),
    actorType: tx.actorType,
    actorUserId: tx.actorUserId,
    subjectUserId: tx.subjectUserId,
    reason: tx.reason,
    relatedType: tx.relatedType,
    relatedId: tx.relatedId,
    reversalOfTransactionId: tx.reversalOfTransactionId,
    createdAt: tx.createdAt,
    postedAt: tx.postedAt,
  };
}

export function serializeBalance(balance: WalletBalance) {
  return {
    currency: balance.currency,
    availableMinorUnits: balance.available.toMinorUnits().toString(),
    available: balance.available.toDecimalString(),
    lockedMinorUnits: balance.locked.toMinorUnits().toString(),
    locked: balance.locked.toDecimalString(),
  };
}
