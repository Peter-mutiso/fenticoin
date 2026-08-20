import { Injectable } from '@nestjs/common';

import { ProviderNotConfiguredError } from '../../auth/providers/provider-not-configured.error';
import type {
  DepositIntent,
  PaymentProvider,
  PaymentProviderWebhookEvent,
  WithdrawalResult,
} from './payment-provider.interface';

/**
 * The only `PaymentProvider` implementation until the client's chosen
 * vendor is integrated. Every method fails loudly and explicitly — no
 * environment, including development, gets a fake "success" here.
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
}
