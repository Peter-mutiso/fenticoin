import { Module } from '@nestjs/common';

import { AdminWalletController } from './admin-wallet.controller';
import { LedgerService } from './ledger.service';
import { PaymentsModule } from './providers/payments.module';
import { ReconciliationService } from './reconciliation.service';
import { TransactionService } from './transaction.service';
import { WalletController } from './wallet.controller';
import { WalletService } from './wallet.service';

@Module({
  imports: [PaymentsModule],
  controllers: [WalletController, AdminWalletController],
  providers: [WalletService, LedgerService, TransactionService, ReconciliationService],
  exports: [WalletService, LedgerService, TransactionService, ReconciliationService],
})
export class WalletModule {}
