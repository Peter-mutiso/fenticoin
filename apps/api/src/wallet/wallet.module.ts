import { Module } from '@nestjs/common';

import { AdminWalletController } from './admin-wallet.controller';
import { LedgerService } from './ledger.service';
import { ReconciliationService } from './reconciliation.service';
import { TransactionService } from './transaction.service';
import { WalletController } from './wallet.controller';
import { WalletService } from './wallet.service';

@Module({
  controllers: [WalletController, AdminWalletController],
  providers: [WalletService, LedgerService, TransactionService, ReconciliationService],
  exports: [WalletService, LedgerService, TransactionService, ReconciliationService],
})
export class WalletModule {}
