import { Controller, Get, Query } from '@nestjs/common';

import { CurrentUser } from '../authorization/decorators/current-user.decorator';
import type { RequestUser } from '../authorization/types/request-user';
import { ListTransactionsQueryDto } from './dto/list-transactions-query.dto';
import { serializeBalance, serializeTransaction } from './mappers';
import { TransactionService } from './transaction.service';
import { requireCurrency } from './wallet.constants';
import { WalletService } from './wallet.service';

/**
 * Self-service wallet endpoints — always scoped to the authenticated
 * user's own wallet. Deposits and withdrawals live in `payments/` (see
 * `DepositController`/`WithdrawalController`) — this controller only
 * ever reads balance/ledger state, never initiates money movement.
 */
@Controller('wallet')
export class WalletController {
  constructor(
    private readonly walletService: WalletService,
    private readonly transactionService: TransactionService,
  ) {}

  @Get()
  async getBalance(@CurrentUser() user: RequestUser, @Query('currency') currency = 'USD') {
    requireCurrency(currency);
    const balance = await this.walletService.getBalance(user.id, currency);
    return serializeBalance(balance);
  }

  @Get('transactions')
  async listTransactions(@CurrentUser() user: RequestUser, @Query() query: ListTransactionsQueryDto) {
    const items = await this.transactionService.listForUser(user.id, {
      limit: query.limit ?? 25,
      offset: query.offset ?? 0,
    });
    return { items: items.map(serializeTransaction) };
  }
}
