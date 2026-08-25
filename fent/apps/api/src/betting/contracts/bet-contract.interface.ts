import type { BetResult, BetType } from '../../database/schema';

export interface BetPlacementParams {
  selection: string;
  /** Only present for contract types that use one (Higher/Lower). */
  targetPrice?: bigint;
}

export interface BetSettlementParams {
  selection: string;
  targetPrice?: bigint;
  entryPrice: bigint;
  settlementPrice: bigint;
}

/**
 * One bet type's rules, in one place — validating its own placement
 * parameters and determining its own win/loss/push outcome. This is what
 * keeps `BettingService`/`SettlementService` free of "if type is X do Y,
 * else if type is Z do W" branching: they just look up the contract for
 * `bet.type` and call it, via `getBetContract` below.
 */
export interface BetContract {
  readonly type: BetType;
  readonly validSelections: readonly string[];
  /** Throws (a `BadRequestException`) if the placement params are invalid for this contract. */
  validatePlacementParams(params: BetPlacementParams): void;
  /** Pure — no I/O, no side effects. Given entry/settlement prices it always returns the same result. */
  determineResult(params: BetSettlementParams): BetResult;
}
