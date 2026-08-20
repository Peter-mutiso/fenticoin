import { BadRequestException, Injectable } from '@nestjs/common';

import type { BetResult } from '../../database/schema';
import type { BetContract, BetPlacementParams, BetSettlementParams } from './bet-contract.interface';

/**
 * Same mechanics as Rise/Fall (direction relative to entry price) under a
 * different label/vocabulary. Kept as its own contract class — not an
 * alias of `RiseFallContract` — both because the spec calls for three
 * distinct typed contracts and because it leaves room for the two to
 * genuinely diverge later (e.g. different default durations) without a
 * refactor. A tie is a push, same as Rise/Fall.
 */
@Injectable()
export class UpDownContract implements BetContract {
  readonly type = 'up_down' as const;
  readonly validSelections = ['up', 'down'] as const;

  validatePlacementParams(params: BetPlacementParams): void {
    if (!this.validSelections.includes(params.selection as 'up' | 'down')) {
      throw new BadRequestException(`Up/Down selection must be one of: ${this.validSelections.join(', ')}`);
    }
  }

  determineResult(params: BetSettlementParams): BetResult {
    if (params.settlementPrice === params.entryPrice) return 'push';
    const wentUp = params.settlementPrice > params.entryPrice;
    const won = (params.selection === 'up' && wentUp) || (params.selection === 'down' && !wentUp);
    return won ? 'win' : 'loss';
  }
}
