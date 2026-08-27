import { Controller, ForbiddenException, Get, HttpCode, HttpStatus, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';

import type { AuthResult } from '../auth/auth.service';
import { CurrentUser } from '../authorization/decorators/current-user.decorator';
import type { RequestUser } from '../authorization/types/request-user';
import { DemoService } from './demo.service';

function metaFromRequest(req: Request): { userAgent?: string; ipAddress?: string } {
  return { userAgent: req.headers['user-agent'], ipAddress: req.ip };
}

@Controller('demo')
export class DemoController {
  constructor(private readonly demoService: DemoService) {}

  @HttpCode(HttpStatus.OK)
  @Post('enter')
  enterDemo(@CurrentUser() user: RequestUser, @Req() req: Request): Promise<AuthResult> {
    return this.demoService.enterDemo(user.id, metaFromRequest(req));
  }

  /** Both accounts' balances, without switching sessions — see `DemoService.getStatus`. Powers the header account switcher. */
  @Get('status')
  getStatus(@CurrentUser() user: RequestUser, @Query('currency') currency = 'USD') {
    return this.demoService.getStatus(user, currency);
  }

  /**
   * Deliberately only ever operates on `user.id` from the caller's own
   * verified session — never a path/body-supplied target — so this can
   * never be pointed at someone else's (or a real) account.
   */
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('reset')
  async resetDemo(@CurrentUser() user: RequestUser): Promise<void> {
    if (user.accountType !== 'demo') {
      throw new ForbiddenException('Only a demo account can be reset');
    }
    await this.demoService.resetDemo(user.id);
  }
}
