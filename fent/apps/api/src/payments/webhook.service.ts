import { createHash } from 'node:crypto';

import { Injectable, Logger, NotFoundException, UnauthorizedException } from '@nestjs/common';

import { DepositService } from './deposit.service';
import { PaymentService } from './payment.service';
import type { PaymentWebhookOutcome } from '../database/schema';
import { PaymentWebhookReceiptService } from './payment-webhook-receipt.service';
import type { PaymentProviderWebhookEvent } from './providers/payment-provider.interface';
import { WithdrawalService } from './withdrawal.service';

export interface WebhookProcessingResult {
  outcome: PaymentWebhookOutcome;
}

/**
 * The single entry point for inbound provider webhooks. Responsible for
 * exactly three things, in order: (1) verify the signature — an invalid
 * one is rejected before anything else happens, (2) record a receipt of
 * this delivery attempt regardless of outcome, (3) route to
 * `DepositService`/`WithdrawalService`, which independently re-verify
 * with the provider before ever changing money. This service never
 * trusts the webhook payload's claimed amount/status by itself — see
 * `DepositService.verifyAndCompleteDeposit` / `WithdrawalService.verifyAndSettleWithdrawal`.
 */
@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name);

  constructor(
    private readonly paymentService: PaymentService,
    private readonly depositService: DepositService,
    private readonly withdrawalService: WithdrawalService,
    private readonly receiptService: PaymentWebhookReceiptService,
  ) {}

  async handleWebhook(rawBody: string, signatureHeader: string | undefined): Promise<WebhookProcessingResult> {
    const rawBodyHash = createHash('sha256').update(rawBody).digest('hex');
    const providerName = this.paymentService.providerName;

    let event: PaymentProviderWebhookEvent;
    try {
      event = this.paymentService.parseWebhookEvent(rawBody, signatureHeader);
    } catch (error) {
      await this.receiptService.record({
        providerName,
        rawBodyHash,
        signatureValid: false,
        outcome: 'invalid_signature',
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      this.logger.warn(`Rejected webhook with invalid signature from ${providerName}`);
      throw new UnauthorizedException('Invalid webhook signature');
    }

    try {
      if (event.kind === 'deposit_confirmed' || event.kind === 'deposit_failed') {
        const { deposit, wasAlreadyResolved } = await this.depositService.verifyAndCompleteDeposit(event.providerReference);
        const outcome: PaymentWebhookOutcome = wasAlreadyResolved ? 'duplicate_ignored' : 'processed';
        await this.receiptService.record({
          providerName,
          providerReference: event.providerReference,
          kind: event.kind,
          rawBodyHash,
          signatureValid: true,
          outcome,
          relatedDepositId: deposit.id,
        });
        return { outcome };
      }

      const { withdrawal, wasAlreadyResolved } = await this.withdrawalService.verifyAndSettleWithdrawal(event.providerReference);
      const outcome: PaymentWebhookOutcome = wasAlreadyResolved ? 'duplicate_ignored' : 'processed';
      await this.receiptService.record({
        providerName,
        providerReference: event.providerReference,
        kind: event.kind,
        rawBodyHash,
        signatureValid: true,
        outcome,
        relatedWithdrawalId: withdrawal.id,
      });
      return { outcome };
    } catch (error) {
      const outcome: PaymentWebhookOutcome = error instanceof NotFoundException ? 'unrecognized_reference' : 'error';
      await this.receiptService.record({
        providerName,
        providerReference: event.providerReference,
        kind: event.kind,
        rawBodyHash,
        signatureValid: true,
        outcome,
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      this.logger.error(`Failed to process ${event.kind} webhook for ${event.providerReference}: ${String(error)}`);
      // Re-thrown so the controller can still return an appropriate HTTP
      // status — the receipt above is what makes this investigable either way.
      throw error;
    }
  }
}
