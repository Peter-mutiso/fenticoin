import { Body, Controller, Get, Headers, Param, Post, Query } from '@nestjs/common';

import { CurrentUser } from '../authorization/decorators/current-user.decorator';
import { RequirePermissions } from '../authorization/decorators/require-permissions.decorator';
import { PERMISSIONS } from '../authorization/permissions.catalog';
import type { RequestUser } from '../authorization/types/request-user';
import { AdjustBalanceDto } from './dto/adjust-balance.dto';
import { GrantBonusDto } from './dto/grant-bonus.dto';
import { ListTransactionsQueryDto } from './dto/list-transactions-query.dto';
import { serializeBalance, serializeTransaction } from './mappers';
import { TransactionService } from './transaction.service';
import { requireCurrency } from './wallet.constants';
import { WalletService } from './wallet.service';

/**
 * Administrative wallet operations. Every route requires the matching
 * granular permission (`wallet.view`/`wallet.adjust`) — never inferred
 * from a role name — enforced server-side by `PermissionsGuard`.
 */
@Controller('admin/wallet')
export class AdminWalletController {
  constructor(
    private readonly walletService: WalletService,
    private readonly transactionService: TransactionService,
  ) {}

  @RequirePermissions(PERMISSIONS.WALLET_VIEW)
  @Get(':userId')
  async getBalance(@Param('userId') userId: string, @Query('currency') currency = 'USD') {
    requireCurrency(currency);
    const balance = await this.walletService.getBalance(userId, currency);
    return serializeBalance(balance);
  }

  @RequirePermissions(PERMISSIONS.WALLET_VIEW)
  @Get(':userId/transactions')
  async listTransactions(@Param('userId') userId: string, @Query() query: ListTransactionsQueryDto) {
    const items = await this.transactionService.listForUser(userId, {
      limit: query.limit ?? 25,
      offset: query.offset ?? 0,
    });
    return { items: items.map(serializeTransaction) };
  }

  /**
   * Manual ledger adjustment. Requires a written reason and is fully
   * audited via the resulting `adjustment` transaction row (actor = the
   * admin, subject = the target user) — see `TransactionService.adjustBalance`.
   */
  @RequirePermissions(PERMISSIONS.WALLET_ADJUST)
  @Post(':userId/adjust')
  async adjustBalance(
    @Param('userId') userId: string,
    @Body() dto: AdjustBalanceDto,
    @CurrentUser() actor: RequestUser,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    const tx = await this.transactionService.adjustBalance({
      userId,
      currency: dto.currency,
      amount: BigInt(dto.amountMinorUnits),
      direction: dto.direction,
      reason: dto.reason,
      actorType: 'admin',
      actorUserId: actor.id,
      idempotencyKey,
    });
    return serializeTransaction(tx);
  }

  /**
   * A one-off, audited real-money credit — the same ledger risk profile as
   * an upward manual adjustment, so it requires the same `wallet.adjust`
   * permission (held only by `finance`/`super_admin`, never plain `admin`).
   * The resulting `bonus`-type transaction row is itself the audit record
   * (actor/subject/reason), identical to how `adjustBalance` works.
   */
  @RequirePermissions(PERMISSIONS.WALLET_ADJUST)
  @Post(':userId/grant-bonus')
  async grantBonus(
    @Param('userId') userId: string,
    @Body() dto: GrantBonusDto,
    @CurrentUser() actor: RequestUser,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    const tx = await this.transactionService.grantBonus({
      userId,
      currency: dto.currency,
      amount: BigInt(dto.amountMinorUnits),
      reason: dto.reason,
      actorType: 'admin',
      actorUserId: actor.id,
      idempotencyKey,
    });
    return serializeTransaction(tx);
  }
}
