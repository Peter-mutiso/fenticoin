/**
 * Provider-agnostic payment abstraction. No concrete implementation
 * exists yet — the client will specify the actual vendor (M-Pesa,
 * SasaPay, MegaPay, Stripe, a crypto on/off-ramp, etc.) later. Nothing in
 * the payments or wallet modules depends on a specific provider's SDK;
 * everything goes through this interface, so plugging in a real one
 * later touches only `providers/`, never `DepositService`,
 * `WithdrawalService`, or the ledger.
 *
 * There is deliberately NO console/dev-stub fallback here: fabricating a
 * "payment succeeded" result — even in development — is exactly the
 * anti-pattern this platform exists to not be. `UnconfiguredPaymentProvider`
 * is the only implementation until a real one is wired up, and it always
 * fails loudly.
 *
 * `verifyDeposit`/`verifyWithdrawal` exist as a distinct step from the
 * webhook itself: a webhook (even with a valid signature) is a *claim*
 * from the provider about what happened, delivered over a channel that
 * can misfire, replay, or (for a compromised or misconfigured provider
 * integration) lie. `DepositService`/`WithdrawalService` only ever credit
 * or settle money after independently asking the provider "what is the
 * true status of this transaction" through this method — never from the
 * webhook payload's claimed amount/status alone.
 */
export interface DepositIntent {
  providerReference: string;
  redirectUrl?: string;
}

export interface WithdrawalResult {
  providerReference: string;
  status: 'pending' | 'submitted';
}

export interface PaymentProviderWebhookEvent {
  providerReference: string;
  kind: 'deposit_confirmed' | 'deposit_failed' | 'withdrawal_settled' | 'withdrawal_failed';
  amountMinorUnits: bigint;
  currency: string;
}

export interface PaymentVerificationResult {
  status: 'completed' | 'pending' | 'failed';
  amountMinorUnits: bigint;
  currency: string;
}

export interface PaymentProvider {
  readonly name: string;
  isConfigured(): boolean;
  createDeposit(params: { userId: string; currency: string; amountMinorUnits: bigint }): Promise<DepositIntent>;
  createWithdrawal(params: {
    userId: string;
    currency: string;
    amountMinorUnits: bigint;
  }): Promise<WithdrawalResult>;
  /** Verifies and parses an inbound webhook payload from the provider. Throws on an invalid signature. */
  parseWebhookEvent(rawBody: string, signatureHeader: string | undefined): PaymentProviderWebhookEvent;
  /** Independent, server-initiated confirmation of a deposit's true status — never trust the webhook payload alone. */
  verifyDeposit(providerReference: string): Promise<PaymentVerificationResult>;
  /** Independent, server-initiated confirmation of a withdrawal's true status. */
  verifyWithdrawal(providerReference: string): Promise<PaymentVerificationResult>;
}

export type WithdrawalSubmissionOutcome = 'rejected' | 'not_submitted' | 'unknown';

export class PaymentProviderSubmissionError extends Error {
  constructor(
    message: string,
    readonly outcome: WithdrawalSubmissionOutcome,
  ) {
    super(message);
    this.name = 'PaymentProviderSubmissionError';
  }
}

export const PAYMENT_PROVIDER = Symbol('PAYMENT_PROVIDER');
