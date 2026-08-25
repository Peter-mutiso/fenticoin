import { ProviderNotConfiguredError } from '../../auth/providers/provider-not-configured.error';
import { UnconfiguredPaymentProvider } from './unconfigured-payment.provider';

describe('UnconfiguredPaymentProvider', () => {
  it('reports that no provider is configured', () => {
    const provider = new UnconfiguredPaymentProvider();

    expect(provider.isConfigured()).toBe(false);
    expect(provider.name).toBe('Payments (unconfigured)');
  });

  it('fails every provider operation explicitly', async () => {
    const provider = new UnconfiguredPaymentProvider();

    await expect(provider.createDeposit()).rejects.toThrow(ProviderNotConfiguredError);
    await expect(provider.createWithdrawal()).rejects.toThrow(ProviderNotConfiguredError);
    expect(() => provider.parseWebhookEvent()).toThrow(ProviderNotConfiguredError);
    await expect(provider.verifyDeposit()).rejects.toThrow(ProviderNotConfiguredError);
    await expect(provider.verifyWithdrawal()).rejects.toThrow(ProviderNotConfiguredError);
  });
});