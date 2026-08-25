import { Injectable } from '@nestjs/common';

import type { BetType } from '../../database/schema';
import type { BetContract } from './bet-contract.interface';
import { HigherLowerContract } from './higher-lower.contract';
import { RiseFallContract } from './rise-fall.contract';
import { UpDownContract } from './up-down.contract';

/**
 * The one place that maps a `BetType` to its contract — a lookup table,
 * not business logic. Every caller that needs type-specific behavior
 * (validation, settlement) goes through `get()` and then talks only to
 * the returned `BetContract`, never branches on `type` itself.
 */
@Injectable()
export class BetContractRegistry {
  private readonly contracts: Record<BetType, BetContract>;

  constructor(riseFall: RiseFallContract, higherLower: HigherLowerContract, upDown: UpDownContract) {
    this.contracts = {
      rise_fall: riseFall,
      higher_lower: higherLower,
      up_down: upDown,
    };
  }

  get(type: BetType): BetContract {
    return this.contracts[type];
  }
}
