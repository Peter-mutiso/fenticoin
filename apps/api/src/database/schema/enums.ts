import { pgEnum } from 'drizzle-orm/pg-core';

export const accountStatusEnum = pgEnum('account_status', [
  'active',
  'suspended',
  'banned',
  'pending_deletion',
]);

export const kycStatusEnum = pgEnum('kyc_status', ['unverified', 'pending', 'approved', 'rejected']);

export const eligibilityStatusEnum = pgEnum('eligibility_status', [
  'unknown',
  'eligible',
  'ineligible',
]);

export const authProviderEnum = pgEnum('auth_provider', ['password', 'google', 'phone']);

export const verificationTokenTypeEnum = pgEnum('verification_token_type', [
  'email_verification',
  'phone_otp',
  'password_reset',
]);

export const sessionRevokedReasonEnum = pgEnum('session_revoked_reason', [
  'logout',
  'logout_all',
  'rotated',
  'rotation_reuse_detected',
  'admin_revoked',
  'password_changed',
  'account_suspended',
]);
export type SessionRevokedReason = (typeof sessionRevokedReasonEnum.enumValues)[number];

export const auditActorTypeEnum = pgEnum('audit_actor_type', ['user', 'system']);

// ---- wallet / ledger --------------------------------------------------

export const ledgerAccountOwnerTypeEnum = pgEnum('ledger_account_owner_type', ['user', 'system']);

/**
 * `available` / `locked` are the two accounts every wallet has (see
 * `wallets`/`ledger_accounts` schema comments). `system` accounts are the
 * house's own side of the double-entry books — never owned by a wallet.
 */
export const ledgerAccountKindEnum = pgEnum('ledger_account_kind', ['available', 'locked', 'system']);

/**
 * The house's minimal chart of accounts. Every ledger transaction that
 * isn't a pure user-internal transfer (available <-> locked) posts its
 * other leg to exactly one of these:
 *  - house_cash: real custodial funds (deposits in, withdrawals out).
 *  - house_revenue: money flowing TO the house (bet losses, fees, downward
 *    manual adjustments).
 *  - house_liability: money flowing FROM the house to users beyond their
 *    own locked stake (bet win profit, bonuses, upward manual adjustments).
 */
export const houseSystemAccountKeyEnum = pgEnum('house_system_account_key', [
  'house_cash',
  'house_revenue',
  'house_liability',
]);

export const ledgerDirectionEnum = pgEnum('ledger_direction', ['debit', 'credit']);

export const transactionTypeEnum = pgEnum('transaction_type', [
  'deposit',
  'withdrawal',
  'bet_placement',
  'bet_refund',
  'bet_win',
  'bet_loss',
  'bonus',
  'adjustment',
  'fee',
  'reversal',
]);
export type TransactionType = (typeof transactionTypeEnum.enumValues)[number];

export const transactionStatusEnum = pgEnum('transaction_status', [
  'pending',
  'posted',
  'failed',
  'reversed',
]);
export type TransactionStatus = (typeof transactionStatusEnum.enumValues)[number];

export const transactionActorTypeEnum = pgEnum('transaction_actor_type', ['user', 'admin', 'system']);
export type TransactionActorType = (typeof transactionActorTypeEnum.enumValues)[number];

// ---- markets / instruments ---------------------------------------------

/**
 * `active`: tradable. `suspended`: temporarily paused (e.g. a feed
 * problem) — reversible, and reason/actor are audited. `delisted`:
 * permanently removed from trading and hidden from default listings, but
 * never deleted — historical bets/price history must stay intact.
 */
export const instrumentStatusEnum = pgEnum('instrument_status', ['active', 'suspended', 'delisted']);
export type InstrumentStatus = (typeof instrumentStatusEnum.enumValues)[number];

// ---- betting -------------------------------------------------------------

export const betTypeEnum = pgEnum('bet_type', ['rise_fall', 'higher_lower', 'up_down']);
export type BetType = (typeof betTypeEnum.enumValues)[number];

/**
 * Lifecycle, not outcome — see `result` for the contract's raw
 * determination. Full legal-transition table lives in
 * `betting/bet-state-machine.ts`; summary:
 *   open -> pending (claimed for settlement) -> won | lost | void
 *   open -> pending -> requires_review (after repeated settlement failures)
 *   requires_review -> won | lost | void | cancelled | refunded (admin, manual)
 *   open -> cancelled (admin/system, pre-settlement)
 *   won | lost -> disputed -> won | lost | refunded
 * `cancelled`, `void`, `refunded` are terminal; so are `won`/`lost` unless disputed.
 */
export const betStatusEnum = pgEnum('bet_status', [
  'pending',
  'open',
  'won',
  'lost',
  'void',
  'cancelled',
  'refunded',
  'disputed',
  'requires_review',
]);
export type BetStatus = (typeof betStatusEnum.enumValues)[number];

/** The contract's raw outcome determination — immutable once set, independent of later status changes (e.g. a dispute). */
export const betResultEnum = pgEnum('bet_result', ['win', 'loss', 'push']);
export type BetResult = (typeof betResultEnum.enumValues)[number];

/**
 * The outcome of a single settlement *attempt*, recorded in
 * `bet_settlement_audits`. Distinct from `bet_result`: an attempt can
 * `fail` (price feed down, stale price, unexpected error) without ever
 * producing a win/loss/push determination — that's exactly the case the
 * audit trail exists to make visible rather than silently retrying forever.
 */
export const settlementOutcomeEnum = pgEnum('settlement_outcome', ['win', 'loss', 'push', 'failed']);
export type SettlementOutcome = (typeof settlementOutcomeEnum.enumValues)[number];
