import type { Bet, BetSettlementAudit, BettingConfig } from '../database/schema';

export function serializeBet(bet: Bet) {
  return {
    id: bet.id,
    userId: bet.userId,
    instrumentId: bet.instrumentId,
    type: bet.type,
    selection: bet.selection,
    stakeAmountMinorUnits: bet.stakeAmount.toString(),
    currency: bet.currency,
    entryPriceMinorUnits: bet.entryPrice.toString(),
    entryPriceObservedAt: bet.entryPriceObservedAt,
    targetPriceMinorUnits: bet.targetPrice?.toString() ?? null,
    payoutRateBasisPoints: bet.payoutRateBasisPoints.toString(),
    potentialPayoutMinorUnits: bet.potentialPayout.toString(),
    status: bet.status,
    result: bet.result,
    placedAt: bet.placedAt,
    expiresAt: bet.expiresAt,
    settlementPriceMinorUnits: bet.settlementPrice?.toString() ?? null,
    settlementPriceObservedAt: bet.settlementPriceObservedAt,
    settledAt: bet.settledAt,
    placementTransactionId: bet.placementTransactionId,
    settlementTransactionId: bet.settlementTransactionId,
    cancelReason: bet.cancelReason,
  };
}

export function serializeSettlementAudit(audit: BetSettlementAudit) {
  return {
    id: audit.id,
    betId: audit.betId,
    attemptedAt: audit.attemptedAt,
    calculationVersion: audit.calculationVersion,
    openingPriceMinorUnits: audit.openingPrice.toString(),
    openingPriceSource: audit.openingPriceSource,
    openingPriceObservedAt: audit.openingPriceObservedAt,
    closingPriceMinorUnits: audit.closingPrice?.toString() ?? null,
    closingPriceSource: audit.closingPriceSource,
    closingPriceObservedAt: audit.closingPriceObservedAt,
    stakeAmountMinorUnits: audit.stakeAmount.toString(),
    payoutRateBasisPoints: audit.payoutRateBasisPoints.toString(),
    computedPayoutMinorUnits: audit.computedPayout?.toString() ?? null,
    outcome: audit.outcome,
    finalStatus: audit.finalStatus,
    settlementTransactionId: audit.settlementTransactionId,
    isManualResolution: audit.isManualResolution,
    actorUserId: audit.actorUserId,
    errorCode: audit.errorCode,
    errorMessage: audit.errorMessage,
    createdAt: audit.createdAt,
  };
}

export function serializeBettingConfig(config: BettingConfig) {
  return {
    id: config.id,
    instrumentId: config.instrumentId,
    betType: config.betType,
    minStakeMinorUnits: config.minStake.toString(),
    maxStakeMinorUnits: config.maxStake.toString(),
    payoutRateBasisPoints: config.payoutRateBasisPoints.toString(),
    maxExposureMinorUnits: config.maxExposure?.toString() ?? null,
    minDurationSeconds: config.minDurationSeconds.toString(),
    maxDurationSeconds: config.maxDurationSeconds.toString(),
    isEnabled: config.isEnabled,
  };
}
