import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';

import { DRIZZLE_CLIENT } from '../database/database.constants';
import type { DrizzleDb } from '../database/database.types';
import { type PaymentWebhookOutcome, type PaymentWebhookReceipt, paymentWebhookReceipts } from '../database/schema';

export interface RecordWebhookReceiptInput {
  providerName: string;
  providerReference?: string;
  kind?: string;
  rawBodyHash: string;
  signatureValid: boolean;
  outcome: PaymentWebhookOutcome;
  relatedDepositId?: string;
  relatedWithdrawalId?: string;
  errorMessage?: string;
}

/**
 * The only writer of `payment_webhook_receipts` — every inbound webhook
 * delivery gets a row here, including duplicates, retries, and rejected
 * deliveries, independent of whatever it did (or didn't) cause to
 * happen. This is the audit trail "investigating failed transactions"
 * and duplicate-callback handling rest on.
 */
@Injectable()
export class PaymentWebhookReceiptService {
  constructor(@Inject(DRIZZLE_CLIENT) private readonly db: DrizzleDb) {}

  async record(input: RecordWebhookReceiptInput): Promise<PaymentWebhookReceipt> {
    const [receipt] = await this.db.insert(paymentWebhookReceipts).values(input).returning();
    if (!receipt) throw new Error('Failed to record payment webhook receipt');
    return receipt;
  }

  async listForDeposit(depositId: string): Promise<PaymentWebhookReceipt[]> {
    return this.db
      .select()
      .from(paymentWebhookReceipts)
      .where(eq(paymentWebhookReceipts.relatedDepositId, depositId))
      .orderBy(desc(paymentWebhookReceipts.receivedAt));
  }

  async listForWithdrawal(withdrawalId: string): Promise<PaymentWebhookReceipt[]> {
    return this.db
      .select()
      .from(paymentWebhookReceipts)
      .where(eq(paymentWebhookReceipts.relatedWithdrawalId, withdrawalId))
      .orderBy(desc(paymentWebhookReceipts.receivedAt));
  }

  async listByProviderReference(providerName: string, providerReference: string): Promise<PaymentWebhookReceipt[]> {
    return this.db
      .select()
      .from(paymentWebhookReceipts)
      .where(and(eq(paymentWebhookReceipts.providerName, providerName), eq(paymentWebhookReceipts.providerReference, providerReference)))
      .orderBy(desc(paymentWebhookReceipts.receivedAt));
  }
}
