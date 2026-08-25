import { Controller, Get, MessageEvent, Param, Query, Sse } from '@nestjs/common';
import { map, type Observable } from 'rxjs';

import { Public } from '../authorization/decorators/public.decorator';
import { MarketCategoryService } from './market-category.service';
import { serializeInstrument, serializeMarketCategory, serializePriceQuote } from './mappers';
import { PriceFeedService } from './price-feed.service';
import { InstrumentService } from './instrument.service';

/** Public, read-only market data — no authentication required. */
@Public()
@Controller('markets')
export class MarketsController {
  constructor(
    private readonly instrumentService: InstrumentService,
    private readonly marketCategoryService: MarketCategoryService,
    private readonly priceFeedService: PriceFeedService,
  ) {}

  @Get('categories')
  async listCategories() {
    const categories = await this.marketCategoryService.list();
    return { items: categories.map(serializeMarketCategory) };
  }

  @Get('instruments')
  async listInstruments(@Query('category') category?: string) {
    const instruments = await this.instrumentService.list({ categoryKey: category });
    return { items: instruments.map(serializeInstrument) };
  }

  @Get('instruments/:id')
  async getInstrument(@Param('id') id: string) {
    const instrument = await this.instrumentService.getById(id);
    return serializeInstrument(instrument);
  }

  @Get('instruments/:id/price')
  async getPrice(@Param('id') id: string) {
    const quote = await this.priceFeedService.getLatestPrice(id);
    return serializePriceQuote(quote);
  }

  @Sse('instruments/:id/price-stream')
  streamPrice(@Param('id') id: string): Observable<MessageEvent> {
    return this.priceFeedService.priceStream$(id).pipe(map((quote) => ({ data: serializePriceQuote(quote) })));
  }
}
