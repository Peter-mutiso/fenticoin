import { Controller, Get, Post } from '@nestjs/common';

import { CurrentUser } from '../authorization/decorators/current-user.decorator';
import type { RequestUser } from '../authorization/types/request-user';
import { BotService } from './bot.service';

@Controller('bots')
export class BotController {
  constructor(private readonly botService: BotService) {}

  @Get('me')
  getMine(@CurrentUser() user: RequestUser) { return this.botService.getOrCreate(user.id); }

  @Post('me/activate')
  activate(@CurrentUser() user: RequestUser) { return this.botService.setActive(user.id, true); }

  @Post('me/deactivate')
  deactivate(@CurrentUser() user: RequestUser) { return this.botService.setActive(user.id, false); }
}