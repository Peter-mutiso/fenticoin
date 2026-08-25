import { Body, Controller, Get, Param, Post, Put, Query } from '@nestjs/common';

import { CurrentUser } from '../authorization/decorators/current-user.decorator';
import { RequirePermissions } from '../authorization/decorators/require-permissions.decorator';
import { PERMISSIONS } from '../authorization/permissions.catalog';
import type { RequestUser } from '../authorization/types/request-user';
import { BettingConfigService } from './betting-config.service';
import { BettingService } from './betting.service';
import { BetActionReasonDto, ResolveDisputeDto, ResolveManualReviewDto } from './dto/bet-action-reason.dto';
import { ListAdminBetsQueryDto } from './dto/list-admin-bets-query.dto';
import { UpsertBettingConfigDto } from './dto/upsert-betting-config.dto';
import { serializeBet, serializeBettingConfig, serializeSettlementAudit } from './mappers';
import { SettlementService } from './settlement.service';

/**
 * Admin odds/config management and bet lifecycle actions. Reads require
 * `bets.view`/`markets.view`; odds/limit changes require `odds.manage`;
 * settlement-adjacent actions (cancel/dispute/settle/resolve-review) require `bets.settle`.
 */
@Controller('admin/betting')
export class AdminBettingController {
  constructor(
    private readonly bettingService: BettingService,
    private readonly bettingConfigService: BettingConfigService,
    private readonly settlementService: SettlementService,
  ) {}

  /** Admin bet browsing — active, completed, cancelled/void, disputed, all optionally scoped to one user/instrument. */
  @RequirePermissions(PERMISSIONS.BETS_VIEW)
  @Get('bets')
  async listBets(@Query() query: ListAdminBetsQueryDto) {
    const items = await this.bettingService.listAll({
      limit: query.limit ?? 25,
      offset: query.offset ?? 0,
      status: query.status,
      userId: query.userId,
      instrumentId: query.instrumentId,
    });
    return { items: items.map(serializeBet) };
  }

  @RequirePermissions(PERMISSIONS.MARKETS_VIEW)
  @Get('configs')
  async listConfigs(@Query('instrumentId') instrumentId?: string) {
    const configs = await this.bettingConfigService.list(instrumentId);
    return { items: configs.map(serializeBettingConfig) };
  }

  @RequirePermissions(PERMISSIONS.ODDS_MANAGE)
  @Put('configs')
  async upsertConfig(@Body() dto: UpsertBettingConfigDto, @CurrentUser() actor: RequestUser) {
    const config = await this.bettingConfigService.upsert({
      instrumentId: dto.instrumentId,
      betType: dto.betType,
      minStake: BigInt(dto.minStake),
      maxStake: BigInt(dto.maxStake),
      payoutRateBasisPoints: BigInt(dto.payoutRateBasisPoints),
      maxExposure: dto.maxExposure ? BigInt(dto.maxExposure) : undefined,
      minDurationSeconds: BigInt(dto.minDurationSeconds),
      maxDurationSeconds: BigInt(dto.maxDurationSeconds),
      isEnabled: dto.isEnabled,
      actorUserId: actor.id,
    });
    return serializeBettingConfig(config);
  }

  @RequirePermissions(PERMISSIONS.BETS_SETTLE)
  @Post('bets/:id/cancel')
  async cancelBet(@Param('id') id: string, @Body() dto: BetActionReasonDto, @CurrentUser() actor: RequestUser) {
    const bet = await this.settlementService.cancelBet(id, actor.id, dto.reason);
    return serializeBet(bet);
  }

  @RequirePermissions(PERMISSIONS.BETS_SETTLE)
  @Post('bets/:id/dispute')
  async disputeBet(@Param('id') id: string, @Body() dto: BetActionReasonDto, @CurrentUser() actor: RequestUser) {
    const bet = await this.settlementService.flagDisputed(id, actor.id, dto.reason);
    return serializeBet(bet);
  }

  @RequirePermissions(PERMISSIONS.BETS_SETTLE)
  @Post('bets/:id/resolve-dispute')
  async resolveDispute(@Param('id') id: string, @Body() dto: ResolveDisputeDto, @CurrentUser() actor: RequestUser) {
    const bet = await this.settlementService.resolveDispute(id, dto.resolution, actor.id, dto.reason);
    return serializeBet(bet);
  }

  @RequirePermissions(PERMISSIONS.BETS_SETTLE)
  @Post('bets/:id/settle')
  async settleBet(@Param('id') id: string) {
    const bet = await this.settlementService.settleBet(id);
    return serializeBet(bet);
  }

  /** Bets automated settlement gave up on after repeated failures — need a human to look at them. */
  @RequirePermissions(PERMISSIONS.BETS_VIEW)
  @Get('bets/requiring-review')
  async listRequiringReview() {
    const items = await this.settlementService.listRequiringReview();
    return { items: items.map(serializeBet) };
  }

  // Must be registered after every static `bets/...` route above (e.g.
  // `bets/requiring-review`) — a `:id` param route would otherwise shadow
  // them, since Express matches routes in declaration order.
  @RequirePermissions(PERMISSIONS.BETS_VIEW)
  @Get('bets/:id')
  async getBet(@Param('id') id: string) {
    return serializeBet(await this.bettingService.getById(id));
  }

  /** Every settlement attempt (successful or not) recorded for this bet — the settlement audit trail. */
  @RequirePermissions(PERMISSIONS.BETS_VIEW)
  @Get('bets/:id/settlement-audit')
  async getSettlementAuditTrail(@Param('id') id: string) {
    const items = await this.settlementService.getSettlementAuditTrail(id);
    return { items: items.map(serializeSettlementAudit) };
  }

  @RequirePermissions(PERMISSIONS.BETS_SETTLE)
  @Post('bets/:id/resolve-review')
  async resolveManualReview(
    @Param('id') id: string,
    @Body() dto: ResolveManualReviewDto,
    @CurrentUser() actor: RequestUser,
  ) {
    const bet = await this.settlementService.resolveManualReview(id, dto.resolution, actor.id, dto.reason);
    return serializeBet(bet);
  }
}
