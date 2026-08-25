import { NotImplementedException } from '@nestjs/common';

import { PaymentService } from './payment.service';
import type { PaymentProvider } from './providers/payment-provider.interface';

function makeService(configured: boolean) {
  const provider: Partial<PaymentProvider> = {
    name: 'TestProvider',
    isConfigured: jest.fn().mockReturnValue(configured),
    createDeposit: jest.fn().mockResolvedValue({ providerReference: 'ref-1' }),
    createWithdrawal: jest.fn().mockResolvedValue({ providerReference: 'wref-1', status: 'submitted' }),
    verifyDeposit: jest.fn().mockResolvedValue({ status: 'completed', amountMinorUnits: 100n, currency: 'USD' }),
    verifyWithdrawal: jest.fn().mockResolvedValue({ status: 'completed', amountMinorUnits: 100n, currency: 'USD' }),
    parseWebhookEvent: jest.fn().mockReturnValue({ providerReference: 'ref-1', kind: 'deposit_confirmed', amountMinorUnits: 100n, currency: 'USD' }),
  };
  return { service: new PaymentService(provider as PaymentProvider), provider };
}

describe('PaymentService', () => {
  it('exposes the underlying provider name and configuration state', () => {
    const { service } = makeService(true);
    expect(service.providerName).toBe('TestProvider');
    expect(service.isConfigured()).toBe(true);
  });

  it('delegates every operation to the provider once configured', async () => {
    const { service, provider } = makeService(true);

    await service.createDeposit({ userId: 'u1', currency: 'USD', amountMinorUnits: 100n });
    await service.createWithdrawal({ userId: 'u1', currency: 'USD', amountMinorUnits: 100n });
    await service.verifyDeposit('ref-1');
    await service.verifyWithdrawal('wref-1');
    service.parseWebhookEvent('{}', 'sig');

    expect(provider.createDeposit).toHaveBeenCalled();
    expect(provider.createWithdrawal).toHaveBeenCalled();
    expect(provider.verifyDeposit).toHaveBeenCalledWith('ref-1');
    expect(provider.verifyWithdrawal).toHaveBeenCalledWith('wref-1');
    expect(provider.parseWebhookEvent).toHaveBeenCalledWith('{}', 'sig');
  });

  it('refuses every operation with a clear error when the provider is not configured — never a silent fake success', async () => {
    const { service } = makeService(false);

    await expect(service.createDeposit({ userId: 'u1', currency: 'USD', amountMinorUnits: 100n })).rejects.toThrow(NotImplementedException);
    await expect(service.createWithdrawal({ userId: 'u1', currency: 'USD', amountMinorUnits: 100n })).rejects.toThrow(NotImplementedException);
    await expect(service.verifyDeposit('ref-1')).rejects.toThrow(NotImplementedException);
    await expect(service.verifyWithdrawal('wref-1')).rejects.toThrow(NotImplementedException);
    expect(() => service.parseWebhookEvent('{}', 'sig')).toThrow(NotImplementedException);
  });
});
