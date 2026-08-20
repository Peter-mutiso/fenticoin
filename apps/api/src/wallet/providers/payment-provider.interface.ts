/**
 * Provider-agnostic payment abstraction. No concrete implementation
 * exists yet — the client will specify the actual vendor (Stripe, a
 * bank/ACH processor, a crypto on/off-ramp) later. Nothing in the wallet
 * module depends on a specific provider's SDK; everything goes through
 * this interface, so plugging in a real one later touches only
 * `providers/`, never `TransactionService` or the ledger.
 *
 * Unlike the auth module's SMS/email providers, there is deliberately NO
 * console/dev-stub fallback here: fabricating a "payment succeeded"
 * result — even in development — is exactly the anti-pattern this
 * platform exists to not be. `UnconfiguredPaymentProvider` is the only
 * implementation until a real one is wired up, and it always fails loudly.
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
}

export const PAYMENT_PROVIDER = Symbol('PAYMENT_PROVIDER');
