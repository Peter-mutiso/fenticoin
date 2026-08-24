import { Injectable } from '@nestjs/common';

import { ProviderNotConfiguredError } from '../../auth/providers/provider-not-configured.error';
import type {
  DepositIntent,
  PaymentProvider,
  PaymentProviderWebhookEvent,
  PaymentVerificationResult,
  WithdrawalResult,
} from './payment-provider.interface';

/**
 * The only PaymentProvider implementation until the client's chosen
 * vendor is integrated.
 *
 * Every method fails explicitly. There is no fake/dev payment success.
 */
@Injectable()
export class UnconfiguredPaymentProvider implements PaymentProvider {
  readonly name = 'Payments (unconfigured)';

  isConfigured(): boolean {
    return false;
  }

  async createDeposit(): Promise<DepositIntent> {
    await Promise.resolve();
    throw new ProviderNotConfiguredError('Payment provider');
  }

  async createWithdrawal(): Promise<WithdrawalResult> {
    await Promise.resolve();
    throw new ProviderNotConfiguredError('Payment provider');
  }

  parseWebhookEvent(): PaymentProviderWebhookEvent {
    throw new ProviderNotConfiguredError('Payment provider');
  }

  async verifyDeposit(): Promise<PaymentVerificationResult> {
    await Promise.resolve();
    throw new ProviderNotConfiguredError('Payment provider');
  }

  async verifyWithdrawal(): Promise<PaymentVerificationResult> {
    await Promise.resolve();
    throw new ProviderNotConfiguredError('Payment provider');
  }
}