import { BadRequestException, Injectable } from '@nestjs/common';

import type { BetResult } from '../../database/schema';
import type { BetContract, BetPlacementParams, BetSettlementParams } from './bet-contract.interface';

/** Direction relative to the price *at entry*. A tie (settlement === entry) is a push. */
@Injectable()
export class RiseFallContract implements BetContract {
  readonly type = 'rise_fall' as const;
  readonly validSelections = ['rise', 'fall'] as const;

  validatePlacementParams(params: BetPlacementParams): void {
    if (!this.validSelections.includes(params.selection as 'rise' | 'fall')) {
      throw new BadRequestException(`Rise/Fall selection must be one of: ${this.validSelections.join(', ')}`);
    }
  }

  determineResult(params: BetSettlementParams): BetResult {
    if (params.settlementPrice === params.entryPrice) return 'push';
    const rose = params.settlementPrice > params.entryPrice;
    const won = (params.selection === 'rise' && rose) || (params.selection === 'fall' && !rose);
    return won ? 'win' : 'loss';
  }
}
