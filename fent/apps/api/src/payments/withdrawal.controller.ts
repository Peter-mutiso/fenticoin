import { Body, Controller, Get, Headers, NotFoundException, Param, Post, Query } from '@nestjs/common';

import { CurrentUser } from '../authorization/decorators/current-user.decorator';
import type { RequestUser } from '../authorization/types/request-user';
import { MoneyAmountDto } from '../wallet/dto/money-amount.dto';
import { ListWithdrawalsQueryDto } from './dto/list-withdrawals-query.dto';
import { serializeWithdrawal } from './mappers';
import { WithdrawalService } from './withdrawal.service';

/** Self-service withdrawal endpoints — always scoped to the authenticated user's own withdrawals. */
@Controller('payments/withdrawals')
export class WithdrawalController {
  constructor(private readonly withdrawalService: WithdrawalService) {}

  @Post()
  async requestWithdrawal(
    @CurrentUser() user: RequestUser,
    @Body() dto: MoneyAmountDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    const withdrawal = await this.withdrawalService.requestWithdrawal({
      userId: user.id,
      currency: dto.currency,
      amountMinorUnits: BigInt(dto.amountMinorUnits),
      idempotencyKey,
    });
    return serializeWithdrawal(withdrawal);
  }

  @Get()
  async listWithdrawals(@CurrentUser() user: RequestUser, @Query() query: ListWithdrawalsQueryDto) {
    const items = await this.withdrawalService.listForUser(user.id, {
      limit: query.limit ?? 25,
      offset: query.offset ?? 0,
      status: query.status,
    });
    return { items: items.map(serializeWithdrawal) };
  }

  @Get(':id')
  async getWithdrawal(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    const withdrawal = await this.withdrawalService.getById(id);
    if (withdrawal.userId !== user.id) {
      throw new NotFoundException(`Withdrawal ${id} not found`);
    }
    return serializeWithdrawal(withdrawal);
  }
}
