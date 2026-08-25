/**
 * Bumped whenever settlement logic changes in a way that could affect an
 * outcome — a bet contract's `determineResult` rules or the payout math.
 * Stamped onto every row in `bet_settlement_audits` so a historical
 * settlement can always be traced to the exact logic version that
 * produced it, independent of what the code does today.
 */
export const SETTLEMENT_CALCULATION_VERSION = 1;
