import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';

import { CurrentUser } from '../authorization/decorators/current-user.decorator';
import type { RequestUser } from '../authorization/types/request-user';
import { BOT_PRESETS } from './bot-presets';
import { BotService } from './bot.service';
import { CreateBotDto } from './dto/create-bot.dto';
import { ListBotLogsQueryDto } from './dto/list-bot-logs-query.dto';
import { UpdateBotDto } from './dto/update-bot.dto';
import { ALLOWED_EXECUTION_INTERVAL_SECONDS } from './execution-interval';
import { serializeBot, serializeBotLog } from './mappers';
import { STRATEGY_CATALOG } from './strategy-catalog';

/** Self-service bot endpoints — always scoped to the authenticated user's own bots. */
@Controller('bots')
export class BotController {
  constructor(private readonly botService: BotService) {}

  /**
   * Declared before `:id` — NestJS matches routes in declaration order, and
   * `catalog` must never be captured as an id. Carries the strategy list,
   * the "Recommended Bots" presets (see `bot-presets.ts`), and the
   * canonical interval list — one response the frontend builds the whole
   * `/bots` and `/bots/new` experience from, so it can never drift from
   * what the server actually validates/executes.
   */
  @Get('catalog')
  getCatalog() {
    return { items: STRATEGY_CATALOG, presets: BOT_PRESETS, allowedExecutionIntervalSeconds: ALLOWED_EXECUTION_INTERVAL_SECONDS };
  }

  @Get()
  async list(@CurrentUser() user: RequestUser) {
    const { bots, summary } = await this.botService.list(user.id);
    return { items: bots.map(({ bot, stats }) => serializeBot(bot, stats)), summary };
  }

  @Post()
  async create(@CurrentUser() user: RequestUser, @Body() dto: CreateBotDto) {
    const bot = await this.botService.create(user.id, dto);
    return serializeBot(bot);
  }

  @Get(':id')
  async getById(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    const { bot, stats } = await this.botService.getById(user.id, id);
    return serializeBot(bot, stats);
  }

  @Patch(':id')
  async update(@CurrentUser() user: RequestUser, @Param('id') id: string, @Body() dto: UpdateBotDto) {
    const bot = await this.botService.update(user.id, id, dto);
    return serializeBot(bot);
  }

  @Post(':id/activate')
  async activate(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return serializeBot(await this.botService.setActive(user.id, id, true));
  }

  @Post(':id/deactivate')
  async deactivate(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return serializeBot(await this.botService.setActive(user.id, id, false));
  }

  @Get(':id/logs')
  async listLogs(@CurrentUser() user: RequestUser, @Param('id') id: string, @Query() query: ListBotLogsQueryDto) {
    const items = await this.botService.listLogs(user.id, id, { limit: query.limit ?? 25, offset: query.offset ?? 0 });
    return { items: items.map(serializeBotLog) };
  }
}
