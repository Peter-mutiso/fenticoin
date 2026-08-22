import { UnconfiguredPaymentProvider } from './unconfigured-payment.provider';

describe('UnconfiguredPaymentProvider', () => {
  it('reports itself as not configured', () => {
    expect(new UnconfiguredPaymentProvider().isConfigured()).toBe(false);
  });

  it('never fabricates a successful deposit or withdrawal', async () => {
    const provider = new UnconfiguredPaymentProvider();
    await expect(provider.createDeposit()).rejects.toThrow('not configured');
    await expect(provider.createWithdrawal()).rejects.toThrow('not configured');
    await expect(provider.verifyDeposit()).rejects.toThrow('not configured');
    await expect(provider.verifyWithdrawal()).rejects.toThrow('not configured');
  });

  it('never parses a webhook as valid', () => {
    const provider = new UnconfiguredPaymentProvider();
    expect(() => provider.parseWebhookEvent()).toThrow('not configured');
  });
});
