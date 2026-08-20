import { Body, Controller, Get, Headers, NotFoundException, Param, Post, Query } from '@nestjs/common';

import { CurrentUser } from '../authorization/decorators/current-user.decorator';
import type { RequestUser } from '../authorization/types/request-user';
import { BettingService } from './betting.service';
import { ListBetsQueryDto } from './dto/list-bets-query.dto';
import { PlaceBetDto } from './dto/place-bet.dto';
import { serializeBet } from './mappers';

/** Self-service betting endpoints — always scoped to the authenticated user's own bets. */
@Controller('betting')
export class BettingController {
  constructor(private readonly bettingService: BettingService) {}

  @Post('bets')
  async placeBet(
    @CurrentUser() user: RequestUser,
    @Body() dto: PlaceBetDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    const bet = await this.bettingService.placeBet({
      userId: user.id,
      instrumentId: dto.instrumentId,
      type: dto.type,
      selection: dto.selection,
      targetPrice: dto.targetPrice,
      stakeAmount: BigInt(dto.stakeAmount),
      currency: dto.currency,
      durationSeconds: BigInt(dto.durationSeconds),
      idempotencyKey,
    });
    return serializeBet(bet);
  }

  @Get('bets')
  async listBets(@CurrentUser() user: RequestUser, @Query() query: ListBetsQueryDto) {
    const items = await this.bettingService.listForUser(user.id, {
      limit: query.limit ?? 25,
      offset: query.offset ?? 0,
      status: query.status,
    });
    return { items: items.map(serializeBet) };
  }

  @Get('bets/:id')
  async getBet(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    const bet = await this.bettingService.getById(id);
    if (bet.userId !== user.id) {
      // Same response as "doesn't exist" — never reveal another user's bet exists.
      throw new NotFoundException(`Bet ${id} not found`);
    }
    return serializeBet(bet);
  }
}
