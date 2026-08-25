import type { Deposit, PaymentWebhookReceipt, Withdrawal } from '../database/schema';

export function serializeDeposit(deposit: Deposit) {
  return {
    id: deposit.id,
    userId: deposit.userId,
    currency: deposit.currency,
    amountMinorUnits: deposit.amount.toString(),
    status: deposit.status,
    providerName: deposit.providerName,
    providerReference: deposit.providerReference,
    redirectUrl: deposit.redirectUrl,
    transactionId: deposit.transactionId,
    failureReason: deposit.failureReason,
    expiresAt: deposit.expiresAt,
    createdAt: deposit.createdAt,
    updatedAt: deposit.updatedAt,
  };
}

export function serializeWithdrawal(withdrawal: Withdrawal) {
  return {
    id: withdrawal.id,
    userId: withdrawal.userId,
    currency: withdrawal.currency,
    amountMinorUnits: withdrawal.amount.toString(),
    status: withdrawal.status,
    providerName: withdrawal.providerName,
    providerReference: withdrawal.providerReference,
    holdTransactionId: withdrawal.holdTransactionId,
    releaseTransactionId: withdrawal.releaseTransactionId,
    settlementTransactionId: withdrawal.settlementTransactionId,
    reversalTransactionId: withdrawal.reversalTransactionId,
    reviewedByUserId: withdrawal.reviewedByUserId,
    reviewedAt: withdrawal.reviewedAt,
    rejectionReason: withdrawal.rejectionReason,
    failureReason: withdrawal.failureReason,
    createdAt: withdrawal.createdAt,
    updatedAt: withdrawal.updatedAt,
  };
}

export function serializeWebhookReceipt(receipt: PaymentWebhookReceipt) {
  return {
    id: receipt.id,
    providerName: receipt.providerName,
    providerReference: receipt.providerReference,
    kind: receipt.kind,
    signatureValid: receipt.signatureValid,
    outcome: receipt.outcome,
    relatedDepositId: receipt.relatedDepositId,
    relatedWithdrawalId: receipt.relatedWithdrawalId,
    errorMessage: receipt.errorMessage,
    receivedAt: receipt.receivedAt,
  };
}
