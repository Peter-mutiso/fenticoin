import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module';
import { UsersModule } from '../users/users.module';
import { WalletModule } from '../wallet/wallet.module';
import { AdminPaymentsController } from './admin-payments.controller';
import { DepositController } from './deposit.controller';
import { DepositEligibilityService } from './deposit-eligibility.service';
import { DepositExpiryScheduler } from './deposit-expiry.scheduler';
import { DepositService } from './deposit.service';
import { PaymentReconciliationService } from './payment-reconciliation.service';
import { PaymentService } from './payment.service';
import { PaymentWebhookReceiptService } from './payment-webhook-receipt.service';
import { PaymentProviderModule } from './providers/payment-provider.module';
import { WebhookController } from './webhook.controller';
import { WebhookService } from './webhook.service';
import { WithdrawalController } from './withdrawal.controller';
import { WithdrawalEligibilityService } from './withdrawal-eligibility.service';
import { WithdrawalService } from './withdrawal.service';

@Module({
  // ScheduleModule is registered globally by MarketsModule — @Cron
  // discovery works app-wide once registered anywhere, so it must not be
  // re-registered here (same reasoning as BettingModule).
  imports: [AuditModule, WalletModule, UsersModule, PaymentProviderModule],
  controllers: [DepositController, WithdrawalController, WebhookController, AdminPaymentsController],
  providers: [
    PaymentService,
    DepositEligibilityService,
    DepositService,
    WithdrawalEligibilityService,
    WithdrawalService,
    PaymentWebhookReceiptService,
    WebhookService,
    PaymentReconciliationService,
    DepositExpiryScheduler,
  ],
  exports: [PaymentService, DepositService, WithdrawalService],
})
export class PaymentsModule {}
