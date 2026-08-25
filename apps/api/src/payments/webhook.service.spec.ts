import { NotFoundException, NotImplementedException, UnauthorizedException } from '@nestjs/common';

import { ProviderNotConfiguredError } from '../auth/providers/provider-not-configured.error';
import type { Deposit, Withdrawal } from '../database/schema';
import type { DepositService } from './deposit.service';
import type { PaymentService } from './payment.service';
import type { PaymentWebhookReceiptService } from './payment-webhook-receipt.service';
import { WebhookService } from './webhook.service';
import type { WithdrawalService } from './withdrawal.service';

function makeHarness() {
  const paymentService = {
    providerName: 'TestProvider',
    parseWebhookEvent: jest.fn(),
  };
  const depositService = { verifyAndCompleteDeposit: jest.fn() };
  const withdrawalService = { verifyAndSettleWithdrawal: jest.fn() };
  const receiptService = { record: jest.fn().mockResolvedValue(undefined) };

  const service = new WebhookService(
    paymentService as unknown as PaymentService,
    depositService as unknown as DepositService,
    withdrawalService as unknown as WithdrawalService,
    receiptService as unknown as PaymentWebhookReceiptService,
  );

  return { service, paymentService, depositService, withdrawalService, receiptService };
}

describe('WebhookService', () => {
  describe('invalid signature', () => {
    it('rejects the webhook before any processing and records the attempt as invalid', async () => {
      const h = makeHarness();
      h.paymentService.parseWebhookEvent.mockImplementation(() => {
        throw new Error('Invalid webhook signature');
      });

      await expect(h.service.handleWebhook('{"fake":"body"}', 'bad-signature')).rejects.toThrow(UnauthorizedException);

      expect(h.receiptService.record).toHaveBeenCalledWith(
        expect.objectContaining({ providerName: 'TestProvider', signatureValid: false, outcome: 'invalid_signature' }),
      );
      expect(h.depositService.verifyAndCompleteDeposit).not.toHaveBeenCalled();
      expect(h.withdrawalService.verifyAndSettleWithdrawal).not.toHaveBeenCalled();
    });
  });

  describe('provider availability', () => {
    it('records provider-not-configured as an error, not an invalid signature', async () => {
      const h = makeHarness();
      h.paymentService.parseWebhookEvent.mockImplementation(() => {
        throw new ProviderNotConfiguredError('Payment provider');
      });

      await expect(h.service.handleWebhook('{}', 'sig')).rejects.toThrow(ProviderNotConfiguredError);
      expect(h.receiptService.record).toHaveBeenCalledWith(
        expect.objectContaining({ outcome: 'error', signatureValid: false }),
      );
      expect(h.receiptService.record).not.toHaveBeenCalledWith(expect.objectContaining({ outcome: 'invalid_signature' }));
      expect(h.depositService.verifyAndCompleteDeposit).not.toHaveBeenCalled();
      expect(h.withdrawalService.verifyAndSettleWithdrawal).not.toHaveBeenCalled();
    });

    it('also keeps the payment service wrapper error out of invalid-signature classification', async () => {
      const h = makeHarness();
      h.paymentService.parseWebhookEvent.mockImplementation(() => {
        throw new NotImplementedException('No payment provider is configured');
      });

      await expect(h.service.handleWebhook('{}', 'sig')).rejects.toThrow(NotImplementedException);
      expect(h.receiptService.record).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'error' }));
    });
  });

  describe('deposit webhooks', () => {
    it('routes a deposit_confirmed event to DepositService and records it as processed', async () => {
      const h = makeHarness();
      h.paymentService.parseWebhookEvent.mockReturnValue({ providerReference: 'ref-1', kind: 'deposit_confirmed', amountMinorUnits: 5_000n, currency: 'USD' });
      h.depositService.verifyAndCompleteDeposit.mockResolvedValue({ deposit: { id: 'dep-1', status: 'completed' } as Deposit, wasAlreadyResolved: false });

      const result = await h.service.handleWebhook('{"ref":"ref-1"}', 'sig');

      expect(h.depositService.verifyAndCompleteDeposit).toHaveBeenCalledWith('ref-1');
      expect(result.outcome).toBe('processed');
      expect(h.receiptService.record).toHaveBeenCalledWith(
        expect.objectContaining({ outcome: 'processed', relatedDepositId: 'dep-1', signatureValid: true }),
      );
    });

    it('records a retried callback for an already-resolved deposit as duplicate_ignored', async () => {
      const h = makeHarness();
      h.paymentService.parseWebhookEvent.mockReturnValue({ providerReference: 'ref-1', kind: 'deposit_confirmed', amountMinorUnits: 5_000n, currency: 'USD' });
      h.depositService.verifyAndCompleteDeposit.mockResolvedValue({ deposit: { id: 'dep-1', status: 'completed' } as Deposit, wasAlreadyResolved: true });

      const result = await h.service.handleWebhook('{"ref":"ref-1"}', 'sig');

      expect(result.outcome).toBe('duplicate_ignored');
      expect(h.receiptService.record).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'duplicate_ignored' }));
    });

    it('does not settle twice when the same delivery is received repeatedly', async () => {
      const h = makeHarness();
      h.paymentService.parseWebhookEvent.mockReturnValue({ providerReference: 'ref-1', kind: 'deposit_confirmed', amountMinorUnits: 5_000n, currency: 'USD' });
      h.depositService.verifyAndCompleteDeposit
        .mockResolvedValueOnce({ deposit: { id: 'dep-1', status: 'completed' } as Deposit, wasAlreadyResolved: false })
        .mockResolvedValueOnce({ deposit: { id: 'dep-1', status: 'completed' } as Deposit, wasAlreadyResolved: true });

      const results = await Promise.all([
        h.service.handleWebhook('{"ref":"ref-1"}', 'sig'),
        h.service.handleWebhook('{"ref":"ref-1"}', 'sig'),
      ]);

      expect(results.map((result) => result.outcome).sort()).toEqual(['duplicate_ignored', 'processed']);
      expect(h.depositService.verifyAndCompleteDeposit).toHaveBeenCalledTimes(2);
    });

    it('records an unrecognized provider reference distinctly, and still surfaces the error', async () => {
      const h = makeHarness();
      h.paymentService.parseWebhookEvent.mockReturnValue({ providerReference: 'unknown-ref', kind: 'deposit_failed', amountMinorUnits: 5_000n, currency: 'USD' });
      h.depositService.verifyAndCompleteDeposit.mockRejectedValue(new NotFoundException('No deposit found'));

      await expect(h.service.handleWebhook('{}', 'sig')).rejects.toThrow(NotFoundException);
      expect(h.receiptService.record).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'unrecognized_reference' }));
    });

    it('records an unexpected processing failure as "error" without swallowing it', async () => {
      const h = makeHarness();
      h.paymentService.parseWebhookEvent.mockReturnValue({ providerReference: 'ref-1', kind: 'deposit_confirmed', amountMinorUnits: 5_000n, currency: 'USD' });
      h.depositService.verifyAndCompleteDeposit.mockRejectedValue(new Error('database exploded'));

      await expect(h.service.handleWebhook('{}', 'sig')).rejects.toThrow('database exploded');
      expect(h.receiptService.record).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'error', errorMessage: 'database exploded' }));
    });
  });

  describe('withdrawal webhooks', () => {
    it('routes a withdrawal_settled event to WithdrawalService', async () => {
      const h = makeHarness();
      h.paymentService.parseWebhookEvent.mockReturnValue({ providerReference: 'wref-1', kind: 'withdrawal_settled', amountMinorUnits: 5_000n, currency: 'USD' });
      h.withdrawalService.verifyAndSettleWithdrawal.mockResolvedValue({ withdrawal: { id: 'wd-1', status: 'completed' } as Withdrawal, wasAlreadyResolved: false });

      const result = await h.service.handleWebhook('{}', 'sig');

      expect(h.withdrawalService.verifyAndSettleWithdrawal).toHaveBeenCalledWith('wref-1');
      expect(result.outcome).toBe('processed');
      expect(h.receiptService.record).toHaveBeenCalledWith(expect.objectContaining({ relatedWithdrawalId: 'wd-1' }));
    });

    it('routes a withdrawal_failed event to WithdrawalService too', async () => {
      const h = makeHarness();
      h.paymentService.parseWebhookEvent.mockReturnValue({ providerReference: 'wref-1', kind: 'withdrawal_failed', amountMinorUnits: 5_000n, currency: 'USD' });
      h.withdrawalService.verifyAndSettleWithdrawal.mockResolvedValue({ withdrawal: { id: 'wd-1', status: 'failed' } as Withdrawal, wasAlreadyResolved: false });

      await h.service.handleWebhook('{}', 'sig');
      expect(h.withdrawalService.verifyAndSettleWithdrawal).toHaveBeenCalledWith('wref-1');
      expect(h.depositService.verifyAndCompleteDeposit).not.toHaveBeenCalled();
    });
  });
});
