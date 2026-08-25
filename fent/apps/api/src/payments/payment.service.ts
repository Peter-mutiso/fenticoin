import { Inject, Injectable, NotImplementedException } from '@nestjs/common';

import {
  PAYMENT_PROVIDER,
  type DepositIntent,
  type PaymentProvider,
  type PaymentProviderWebhookEvent,
  type PaymentVerificationResult,
  type WithdrawalResult,
} from './providers/payment-provider.interface';

/**
 * The single choke point every call into the (currently unconfigured)
 * payment provider goes through. `DepositService`/`WithdrawalService`/
 * `WebhookService` depend on this, never on `PAYMENT_PROVIDER` directly —
 * one place to enforce "never proceed against an unconfigured provider"
 * and, later, add logging/metrics/circuit-breaking around every outbound
 * provider call without touching the services that use it.
 */
@Injectable()
export class PaymentService {
  constructor(@Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider) {}

  get providerName(): string {
    return this.provider.name;
  }

  isConfigured(): boolean {
    return this.provider.isConfigured();
  }

  async createDeposit(params: { userId: string; currency: string; amountMinorUnits: bigint }): Promise<DepositIntent> {
    this.assertConfigured();
    return this.provider.createDeposit(params);
  }

  async createWithdrawal(params: { userId: string; currency: string; amountMinorUnits: bigint }): Promise<WithdrawalResult> {
    this.assertConfigured();
    return this.provider.createWithdrawal(params);
  }

  parseWebhookEvent(rawBody: string, signatureHeader: string | undefined): PaymentProviderWebhookEvent {
    this.assertConfigured();
    return this.provider.parseWebhookEvent(rawBody, signatureHeader);
  }

  async verifyDeposit(providerReference: string): Promise<PaymentVerificationResult> {
    this.assertConfigured();
    return this.provider.verifyDeposit(providerReference);
  }

  async verifyWithdrawal(providerReference: string): Promise<PaymentVerificationResult> {
    this.assertConfigured();
    return this.provider.verifyWithdrawal(providerReference);
  }

  private assertConfigured(): void {
    if (!this.provider.isConfigured()) {
      throw new NotImplementedException(
        `No payment provider is configured yet. The ${this.provider.name} adapter and the full deposit/withdrawal lifecycle are implemented and tested — this activates once a real provider is wired up.`,
      );
    }
  }
}
