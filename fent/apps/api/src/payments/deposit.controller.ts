import { Body, Controller, Get, Headers, NotFoundException, Param, Post, Query } from '@nestjs/common';

import { CurrentUser } from '../authorization/decorators/current-user.decorator';
import type { RequestUser } from '../authorization/types/request-user';
import { MoneyAmountDto } from '../wallet/dto/money-amount.dto';
import { DepositService } from './deposit.service';
import { ListDepositsQueryDto } from './dto/list-deposits-query.dto';
import { serializeDeposit } from './mappers';

/** Self-service deposit endpoints — always scoped to the authenticated user's own deposits. */
@Controller('payments/deposits')
export class DepositController {
  constructor(private readonly depositService: DepositService) {}

  @Post()
  async initiateDeposit(
    @CurrentUser() user: RequestUser,
    @Body() dto: MoneyAmountDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    const deposit = await this.depositService.initiateDeposit({
      userId: user.id,
      currency: dto.currency,
      amountMinorUnits: BigInt(dto.amountMinorUnits),
      idempotencyKey,
    });
    return serializeDeposit(deposit);
  }

  @Get()
  async listDeposits(@CurrentUser() user: RequestUser, @Query() query: ListDepositsQueryDto) {
    const items = await this.depositService.listForUser(user.id, {
      limit: query.limit ?? 25,
      offset: query.offset ?? 0,
      status: query.status,
    });
    return { items: items.map(serializeDeposit) };
  }

  @Get(':id')
  async getDeposit(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    const deposit = await this.depositService.getById(id);
    if (deposit.userId !== user.id) {
      throw new NotFoundException(`Deposit ${id} not found`);
    }
    return serializeDeposit(deposit);
  }

  @Post(':id/cancel')
  async cancelDeposit(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    const deposit = await this.depositService.cancelDeposit(id, user.id);
    return serializeDeposit(deposit);
  }
}
