import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import { Money } from '@fenticoin/domain';

import { decimalStringToScaledBigInt } from '../markets/decimal';
import { InstrumentService } from '../markets/instrument.service';
import { isWithinTradingSession, type MarketSessionSchedule } from '../markets/market-session';
import { PriceFeedService } from '../markets/price-feed.service';
import { requireCurrency } from '../wallet/wallet.constants';
import { TransactionService } from '../wallet/transaction.service';
import { UsersService } from '../users/users.service';
import { DRIZZLE_CLIENT } from '../database/database.constants';
import type { DrizzleDb } from '../database/database.types';
import { type Bet, type BetType, bets } from '../database/schema';
import { BettingConfigService } from './betting-config.service';
import { BettingEligibilityService } from './betting-eligibility.service';
import { BetContractRegistry } from './contracts/bet-contract.registry';
import { OddsEngine } from './odds-engine';

const POSTGRES_UNIQUE_VIOLATION = '23505';

export interface PlaceBetInput {
  userId: string;
  instrumentId: string;
  type: BetType;
  selection: string;
  /** Raw decimal string (e.g. "112000.50") — converted to a scaled bigint using the instrument's own pricePrecision. */
  targetPrice?: string;
  stakeAmount: bigint;
  currency: string;
  durationSeconds: bigint;
  idempotencyKey?: string;
}

/**
 * Orchestrates bet placement end to end. Every value that ends up on the
 * bet — entry price, payout rate, potential payout — is looked up or
 * computed here, server-side, from trusted sources
 * (`PriceFeedService`/`BettingConfigService`) or pure math
 * (`OddsEngine`); nothing from the request body is trusted for any of
 * them except the stake amount and the user's selection/target.
 */
@Injectable()
export class BettingService {
  constructor(
    @Inject(DRIZZLE_CLIENT) private readonly db: DrizzleDb,
    private readonly usersService: UsersService,
    private readonly eligibilityService: BettingEligibilityService,
    private readonly instrumentService: InstrumentService,
    private readonly priceFeedService: PriceFeedService,
    private readonly bettingConfigService: BettingConfigService,
    private readonly contractRegistry: BetContractRegistry,
    private readonly oddsEngine: OddsEngine,
    private readonly transactionService: TransactionService,
  ) {}

  async placeBet(input: PlaceBetInput): Promise<Bet> {
    // Fast path: an identical retried request returns the original bet
    // rather than re-running everything below.
    if (input.idempotencyKey) {
      const existing = await this.findByIdempotencyKey(input.idempotencyKey);
      if (existing) return existing;
    }

    // 1 (authenticate) happens in AuthGuard before this is ever called.
    // 2+3: authorize betting / verify account eligibility.
    const user = await this.usersService.findById(input.userId);
    if (!user) throw new NotFoundException('User not found');
    this.eligibilityService.assertCanBet(user);

    // 4: verify market is open.
    const instrument = await this.instrumentService.getById(input.instrumentId);
    if (instrument.status !== 'active') {
      throw new ConflictException(`${instrument.displaySymbol} is not open for trading (${instrument.status})`);
    }
    if (!isWithinTradingSession(instrument.tradingSchedule as MarketSessionSchedule | null, new Date())) {
      throw new ConflictException(`${instrument.displaySymbol} is outside its trading session`);
    }
    if (input.currency !== instrument.quoteCurrency) {
      throw new BadRequestException(`${instrument.displaySymbol} is quoted in ${instrument.quoteCurrency}`);
    }

    // Scaled using *this instrument's* precision — must happen after we
    // know the instrument, and before the contract validates it.
    const targetPriceScaled =
      input.targetPrice !== undefined
        ? decimalStringToScaledBigInt(input.targetPrice, instrument.pricePrecision)
        : undefined;

    // Type-specific validation (selection, targetPrice) — via the
    // matching contract, never a branch on `input.type` here.
    const contract = this.contractRegistry.get(input.type);
    contract.validatePlacementParams({ selection: input.selection, targetPrice: targetPriceScaled });

    const config = await this.bettingConfigService.get(input.instrumentId, input.type);
    if (!config.isEnabled) {
      throw new ConflictException(`${contract.type} betting is currently disabled for ${instrument.displaySymbol}`);
    }

    // 6: validate stake (and duration) against admin-configured bounds.
    if (input.stakeAmount < config.minStake || input.stakeAmount > config.maxStake) {
      throw new BadRequestException(
        `Stake must be between ${config.minStake} and ${config.maxStake} minor units for this market`,
      );
    }
    if (input.durationSeconds < config.minDurationSeconds || input.durationSeconds > config.maxDurationSeconds) {
      throw new BadRequestException(
        `Duration must be between ${config.minDurationSeconds}s and ${config.maxDurationSeconds}s for this market`,
      );
    }

    if (config.maxExposure !== null) {
      const currentExposure = await this.bettingConfigService.getCurrentExposure(input.instrumentId, input.type);
      if (currentExposure + input.stakeAmount > config.maxExposure) {
        throw new ConflictException('Maximum exposure for this market has been reached — try a smaller stake');
      }
    }

    // 5: obtain the trusted market price — never client-supplied.
    const priceQuote = await this.priceFeedService.getLatestPrice(input.instrumentId);

    // 7: calculate payout server-side.
    const currency = requireCurrency(instrument.quoteCurrency);
    const stakeMoney = Money.fromMinorUnits(input.stakeAmount, currency);
    const potentialPayout = this.oddsEngine.calculatePotentialPayout(stakeMoney, config.payoutRateBasisPoints);

    const placedAt = new Date();
    const expiresAt = new Date(placedAt.getTime() + Number(input.durationSeconds) * 1000);

    // 8+9+10, atomically: reserve funds, create the bet, link them —
    // all in one DB transaction, so a crash midway leaves neither a
    // debited wallet with no bet nor a bet with no reserved funds.
    try {
      return await this.db.transaction(async (tx) => {
        const [betRow] = await tx
          .insert(bets)
          .values({
            userId: input.userId,
            instrumentId: input.instrumentId,
            type: input.type,
            selection: input.selection,
            stakeAmount: input.stakeAmount,
            currency: instrument.quoteCurrency,
            entryPrice: priceQuote.price.toMinorUnits(),
            entryPriceObservedAt: priceQuote.observedAt,
            entryPriceSource: priceQuote.source,
            targetPrice: targetPriceScaled,
            payoutRateBasisPoints: config.payoutRateBasisPoints,
            potentialPayout: potentialPayout.toMinorUnits(),
            status: 'open',
            placedAt,
            expiresAt,
            idempotencyKey: input.idempotencyKey,
          })
          .returning();
        if (!betRow) throw new Error('Failed to create bet');

        const ledgerTx = await this.transactionService.placeBet(
          {
            userId: input.userId,
            currency: instrument.quoteCurrency,
            amount: input.stakeAmount,
            actorType: 'user',
            actorUserId: input.userId,
            relatedType: 'bet',
            relatedId: betRow.id,
            idempotencyKey: `bet_placement:${betRow.id}`,
          },
          tx as unknown as DrizzleDb,
        );

        const [linked] = await tx
          .update(bets)
          .set({ placementTransactionId: ledgerTx.id, updatedAt: new Date() })
          .where(eq(bets.id, betRow.id))
          .returning();
        if (!linked) throw new Error('Failed to link placement transaction to bet');

        // 11: return the confirmed bet.
        return linked;
      });
    } catch (error) {
      if (input.idempotencyKey && isUniqueViolation(error)) {
        const existing = await this.findByIdempotencyKey(input.idempotencyKey);
        if (existing) return existing;
      }
      throw error;
    }
  }

  async getById(id: string): Promise<Bet> {
    const [bet] = await this.db.select().from(bets).where(eq(bets.id, id)).limit(1);
    if (!bet) throw new NotFoundException(`Bet ${id} not found`);
    return bet;
  }

  async listForUser(
    userId: string,
    params: { limit: number; offset: number; status?: Bet['status'] },
  ): Promise<Bet[]> {
    const conditions = [eq(bets.userId, userId)];
    if (params.status) conditions.push(eq(bets.status, params.status));

    return this.db
      .select()
      .from(bets)
      .where(and(...conditions))
      .orderBy(desc(bets.createdAt))
      .limit(params.limit)
      .offset(params.offset);
  }

  private async findByIdempotencyKey(idempotencyKey: string): Promise<Bet | undefined> {
    const [existing] = await this.db.select().from(bets).where(and(eq(bets.idempotencyKey, idempotencyKey))).limit(1);
    return existing;
  }
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === POSTGRES_UNIQUE_VIOLATION;
}
