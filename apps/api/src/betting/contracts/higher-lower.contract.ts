import { BadRequestException, Injectable } from '@nestjs/common';

import type { BetResult } from '../../database/schema';
import type { BetContract, BetPlacementParams, BetSettlementParams } from './bet-contract.interface';

/**
 * The only contract that uses `targetPrice`: the user predicts whether
 * the settlement price will land above or below a specific strike price
 * they choose at placement — not the entry price. A tie against the
 * target is a push.
 */
@Injectable()
export class HigherLowerContract implements BetContract {
  readonly type = 'higher_lower' as const;
  readonly validSelections = ['higher', 'lower'] as const;

  validatePlacementParams(params: BetPlacementParams): void {
    if (!this.validSelections.includes(params.selection as 'higher' | 'lower')) {
      throw new BadRequestException(`Higher/Lower selection must be one of: ${this.validSelections.join(', ')}`);
    }
    if (params.targetPrice === undefined || params.targetPrice <= 0n) {
      throw new BadRequestException('Higher/Lower bets require a positive targetPrice');
    }
  }

  determineResult(params: BetSettlementParams): BetResult {
    if (params.targetPrice === undefined) {
      throw new Error('Higher/Lower settlement requires a targetPrice');
    }
    if (params.settlementPrice === params.targetPrice) return 'push';
    const isHigher = params.settlementPrice > params.targetPrice;
    const won = (params.selection === 'higher' && isHigher) || (params.selection === 'lower' && !isHigher);
    return won ? 'win' : 'loss';
  }
}
