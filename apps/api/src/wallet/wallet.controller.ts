import { Body, Controller, Get, Inject, NotImplementedException, Post, Query } from '@nestjs/common';

import { CurrentUser } from '../authorization/decorators/current-user.decorator';
import type { RequestUser } from '../authorization/types/request-user';
import { ListTransactionsQueryDto } from './dto/list-transactions-query.dto';
import { MoneyAmountDto } from './dto/money-amount.dto';
import { serializeBalance, serializeTransaction } from './mappers';
import { PAYMENT_PROVIDER, type PaymentProvider } from './providers/payment-provider.interface';
import { TransactionService } from './transaction.service';
import { requireCurrency } from './wallet.constants';
import { WalletService } from './wallet.service';

/** Self-service wallet endpoints — always scoped to the authenticated user's own wallet. */
@Controller('wallet')
export class WalletController {
  constructor(
    private readonly walletService: WalletService,
    private readonly transactionService: TransactionService,
    @Inject(PAYMENT_PROVIDER) private readonly paymentProvider: PaymentProvider,
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

  @Post('deposits')
  async createDeposit(@CurrentUser() user: RequestUser, @Body() dto: MoneyAmountDto) {
    if (!this.paymentProvider.isConfigured()) {
      throw new NotImplementedException(
        'No payment provider is configured yet. The deposit ledger transaction type exists and is fully tested — this endpoint activates once a provider is wired up.',
      );
    }
    return this.paymentProvider.createDeposit({
      userId: user.id,
      currency: dto.currency,
      amountMinorUnits: BigInt(dto.amountMinorUnits),
    });
  }

  @Post('withdrawals')
  async createWithdrawal(@CurrentUser() user: RequestUser, @Body() dto: MoneyAmountDto) {
    if (!this.paymentProvider.isConfigured()) {
      throw new NotImplementedException(
        'No payment provider is configured yet. The withdrawal ledger transaction type exists and is fully tested — this endpoint activates once a provider is wired up.',
      );
    }
    return this.paymentProvider.createWithdrawal({
      userId: user.id,
      currency: dto.currency,
      amountMinorUnits: BigInt(dto.amountMinorUnits),
    });
  }
}
