import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';

import { CurrentUser } from '../authorization/decorators/current-user.decorator';
import { RequirePermissions } from '../authorization/decorators/require-permissions.decorator';
import { PERMISSIONS } from '../authorization/permissions.catalog';
import type { RequestUser } from '../authorization/types/request-user';
import { CreateInstrumentDto } from './dto/create-instrument.dto';
import { CreateMarketCategoryDto } from './dto/create-market-category.dto';
import { ListInstrumentsQueryDto } from './dto/list-instruments-query.dto';
import { SetInstrumentStatusDto } from './dto/set-instrument-status.dto';
import { UpdateInstrumentDto } from './dto/update-instrument.dto';
import { MarketCategoryService } from './market-category.service';
import { serializeInstrument, serializeMarketCategory, serializePriceQuote } from './mappers';
import { PriceFeedService } from './price-feed.service';
import { InstrumentService } from './instrument.service';

/**
 * Administrative market/instrument management. Every mutating route
 * requires `markets.manage`; reads require `markets.view` — both
 * enforced server-side by `PermissionsGuard`, never inferred from a role.
 */
@Controller('admin/markets')
export class AdminMarketsController {
  constructor(
    private readonly instrumentService: InstrumentService,
    private readonly marketCategoryService: MarketCategoryService,
    private readonly priceFeedService: PriceFeedService,
  ) {}

  @RequirePermissions(PERMISSIONS.MARKETS_VIEW)
  @Get('instruments')
  async listInstruments(@Query() query: ListInstrumentsQueryDto) {
    const instruments = await this.instrumentService.list({
      categoryKey: query.category,
      includeDelisted: query.includeDelisted,
    });
    return { items: instruments.map(serializeInstrument) };
  }

  @RequirePermissions(PERMISSIONS.MARKETS_MANAGE)
  @Post('instruments')
  async createInstrument(@Body() dto: CreateInstrumentDto, @CurrentUser() actor: RequestUser) {
    const instrument = await this.instrumentService.create({ ...dto, createdBy: actor.id });
    return serializeInstrument(instrument);
  }

  @RequirePermissions(PERMISSIONS.MARKETS_MANAGE)
  @Patch('instruments/:id')
  async updateInstrument(
    @Param('id') id: string,
    @Body() dto: UpdateInstrumentDto,
    @CurrentUser() actor: RequestUser,
  ) {
    const instrument = await this.instrumentService.update(id, dto, actor.id);
    return serializeInstrument(instrument);
  }

  @RequirePermissions(PERMISSIONS.MARKETS_MANAGE)
  @Post('instruments/:id/status')
  async setStatus(@Param('id') id: string, @Body() dto: SetInstrumentStatusDto, @CurrentUser() actor: RequestUser) {
    const instrument = await this.instrumentService.setStatus({
      instrumentId: id,
      status: dto.status,
      reason: dto.reason,
      actorUserId: actor.id,
    });
    return serializeInstrument(instrument);
  }

  @RequirePermissions(PERMISSIONS.MARKETS_MANAGE)
  @Post('instruments/:id/refresh')
  async refreshPrice(@Param('id') id: string) {
    const instrument = await this.instrumentService.getById(id);
    const quote = await this.priceFeedService.refreshFromProvider(instrument);
    return quote ? serializePriceQuote(quote) : { refreshed: false };
  }

  @RequirePermissions(PERMISSIONS.MARKETS_MANAGE)
  @Post('categories')
  async createCategory(@Body() dto: CreateMarketCategoryDto) {
    const category = await this.marketCategoryService.create(dto);
    return serializeMarketCategory(category);
  }
}
