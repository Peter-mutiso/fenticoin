// @ts-ignore - NestJS runtime package may not be available in the local type environment.
import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { and, desc, eq, lt, sql } from 'drizzle-orm';

type BetEventEmitter = {
  emit(eventName: string, payload?: unknown): void;
};

import { AuditLogService } from '../audit/audit-log.service';
import { DRIZZLE_CLIENT } from '../database/database.constants';
import type { DrizzleDb } from '../database/database.types';
import {
  type Bet,
  type BetSettlementAudit,
  type BetStatus,
  betSettlementAudits,
  bets,
} from '../database/schema';
import { PriceFeedService } from '../markets/price-feed.service';
import {
  decimalToMinorUnits,
  type PriceQuote,
} from '../markets/price-quote';
import { buildBetEvent } from '../realtime/realtime-events';
import { TransactionService } from '../wallet/transaction.service';
import { assertLegalBetTransition } from './bet-state-machine';
import { BetContractRegistry } from './contracts/bet-contract.registry';
import { SETTLEMENT_CALCULATION_VERSION } from './settlement-calculation-version';

const STUCK_CLAIM_GRACE_SECONDS = 60;

/**
 * After this many failed settlement attempts, a bet stops being
 * automatically retried and is moved to `requires_review`.
 *
 * This prevents persistent price-feed/data problems from causing
 * indefinite automatic retries.
 */
const MAX_SETTLEMENT_ATTEMPTS = 3;

/**
 * Turns an expired `open` bet into a final outcome.
 *
 * Settlement is deliberately two-phase:
 *
 * 1. `claim`
 *    Atomically changes the bet from `open` to `pending`.
 *    Only one concurrent caller can successfully claim a bet.
 *
 * 2. `process`
 *    Retrieves the authoritative settlement price, determines the
 *    outcome, posts the ledger transaction, updates the bet, and
 *    records the settlement audit inside one database transaction.
 *
 * The ledger mutation uses a deterministic idempotency key derived
 * from the bet ID, preventing duplicate settlement payments.
 */
@Injectable()
export class SettlementService {
  private readonly logger = new Logger(SettlementService.name);

  constructor(
    @Inject(DRIZZLE_CLIENT)
    private readonly db: DrizzleDb,

    private readonly priceFeedService: PriceFeedService,
    private readonly contractRegistry: BetContractRegistry,
    private readonly transactionService: TransactionService,
    private readonly auditLog: AuditLogService,
    private readonly events: EventEmitter2,
  ) {}

  async settleBet(betId: string): Promise<Bet> {
    const claimed = await this.claim(betId);

    if (!claimed) {
      // Already settled, already claimed by another caller, or not
      // eligible for settlement. Nothing for this caller to do.
      return this.getById(betId);
    }

    try {
      const settled = await this.process(claimed);

      this.emitBetEvent(settled);

      return settled;
    } catch (error) {
      await this.handleSettlementFailure(claimed, error);
      throw error;
    }
  }

  /**
   * Recovers bets left stuck in `pending` by a crash between claim
   * and process.
   *
   * This should be called before each settlement sweep.
   */
  async releaseStuckClaims(): Promise<number> {
    const cutoff = new Date(
      Date.now() - STUCK_CLAIM_GRACE_SECONDS * 1000,
    );

    const released = await this.db
      .update(bets)
      .set({
        status: 'open',
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(bets.status, 'pending'),
          lt(bets.updatedAt, cutoff),
        ),
      )
      .returning({
        id: bets.id,
      });

    if (released.length > 0) {
      this.logger.warn(
        `Released ${released.length} stuck settlement claim(s) back to open`,
      );
    }

    return released.length;
  }

  async getById(id: string): Promise<Bet> {
    const [bet] = await this.db
      .select()
      .from(bets)
      .where(eq(bets.id, id))
      .limit(1);

    if (!bet) {
      throw new NotFoundException(`Bet ${id} not found`);
    }

    return bet;
  }

  /**
   * Bets automated settlement gave up on after
   * MAX_SETTLEMENT_ATTEMPTS failures.
   */
  async listRequiringReview(): Promise<Bet[]> {
    return this.db
      .select()
      .from(bets)
      .where(eq(bets.status, 'requires_review'))
      .orderBy(desc(bets.updatedAt));
  }

  /**
   * Full settlement history for one bet.
   *
   * Includes failed automated attempts and manual resolution.
   */
  async getSettlementAuditTrail(
    betId: string,
  ): Promise<BetSettlementAudit[]> {
    return this.db
      .select()
      .from(betSettlementAudits)
      .where(eq(betSettlementAudits.betId, betId))
      .orderBy(desc(betSettlementAudits.attemptedAt));
  }

  /**
   * Admin/system cancellation before normal settlement.
   *
   * Refunds the original stake.
   */
  async cancelBet(
    betId: string,
    actorUserId: string,
    reason: string,
  ): Promise<Bet> {
    return this.db
      .transaction(async (tx) => {
        const [claimed] = await tx
          .update(bets)
          .set({
            status: 'cancelled',
            cancelReason: reason,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(bets.id, betId),
              eq(bets.status, 'open'),
            ),
          )
          .returning();

        if (!claimed) {
          throw new ConflictException(
            'Only an open bet can be cancelled',
          );
        }

        const ledgerTx =
          await this.transactionService.refundBet(
            {
              userId: claimed.userId,
              currency: claimed.currency,
              amount: claimed.stakeAmount,
              actorType: 'admin',
              actorUserId,
              reason,
              relatedType: 'bet',
              relatedId: claimed.id,
              idempotencyKey: `bet_cancel:${claimed.id}`,
            },
            tx as unknown as DrizzleDb,
          );

        const [final] = await tx
          .update(bets)
          .set({
            settlementTransactionId: ledgerTx.id,
            settledAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(bets.id, betId))
          .returning();

        if (!final) {
          throw new Error(
            'Failed to finalize bet cancellation',
          );
        }

        await this.auditLog.record({
          actorUserId,
          action: 'bet.cancelled',
          targetType: 'bet',
          targetId: betId,
          after: {
            reason,
          },
        });

        return final;
      })
      .then((final) => {
        this.emitBetEvent(final);
        return final;
      });
  }

  async flagDisputed(
    betId: string,
    actorUserId: string,
    reason: string,
  ): Promise<Bet> {
    const bet = await this.getById(betId);

    assertLegalBetTransition(
      bet.status,
      'disputed',
    );

    const [updated] = await this.db
      .update(bets)
      .set({
        status: 'disputed',
        cancelReason: reason,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(bets.id, betId),
          eq(bets.status, bet.status),
        ),
      )
      .returning();

    if (!updated) {
      throw new ConflictException(
        'Bet status changed before the dispute could be flagged',
      );
    }

    await this.auditLog.record({
      actorUserId,
      action: 'bet.disputed',
      targetType: 'bet',
      targetId: betId,
      before: {
        status: bet.status,
      },
      after: {
        status: 'disputed',
        reason,
      },
    });

    return updated;
  }

  /**
   * `uphold`
   * Keeps the original win/loss outcome.
   *
   * `reverse`
   * Reverses the settlement ledger transaction and refunds
   * the user.
   */
  async resolveDispute(
    betId: string,
    resolution: 'uphold' | 'reverse',
    actorUserId: string,
    reason: string,
  ): Promise<Bet> {
    const bet = await this.getById(betId);

    if (bet.status !== 'disputed') {
      throw new ConflictException(
        'Only a disputed bet can be resolved',
      );
    }

    if (resolution === 'uphold') {
      const targetStatus =
        bet.result === 'win' ? 'won' : 'lost';

      assertLegalBetTransition(
        'disputed',
        targetStatus,
      );

      const [updated] = await this.db
        .update(bets)
        .set({
          status: targetStatus,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(bets.id, betId),
            eq(bets.status, 'disputed'),
          ),
        )
        .returning();

      if (!updated) {
        throw new ConflictException(
          'Bet status changed before the dispute could be resolved',
        );
      }

      await this.auditLog.record({
        actorUserId,
        action: 'bet.dispute_resolved',
        targetType: 'bet',
        targetId: betId,
        after: {
          resolution: 'uphold',
          status: targetStatus,
          reason,
        },
      });

      this.emitBetEvent(updated);

      return updated;
    }

    assertLegalBetTransition(
      'disputed',
      'refunded',
    );

    if (!bet.settlementTransactionId) {
      throw new ConflictException(
        'Bet has no settlement transaction to reverse',
      );
    }

    await this.transactionService.reverseTransaction({
      transactionId: bet.settlementTransactionId,
      actorUserId,
      reason,
      idempotencyKey: `bet_dispute_reverse:${bet.id}`,
    });

    const [updated] = await this.db
      .update(bets)
      .set({
        status: 'refunded',
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(bets.id, betId),
          eq(bets.status, 'disputed'),
        ),
      )
      .returning();

    if (!updated) {
      throw new ConflictException(
        'Bet status changed before the dispute could be resolved',
      );
    }

    await this.auditLog.record({
      actorUserId,
      action: 'bet.dispute_resolved',
      targetType: 'bet',
      targetId: betId,
      after: {
        resolution: 'reverse',
        status: 'refunded',
        reason,
      },
    });

    this.emitBetEvent(updated);

    return updated;
  }

  /**
   * Manually resolves a bet that automated settlement gave up on.
   *
   * The outcome is supplied by an administrator after investigation.
   * This method never re-derives the outcome from the price feed.
   */
  async resolveManualReview(
    betId: string,
    resolution: 'win' | 'loss' | 'void',
    actorUserId: string,
    reason: string,
  ): Promise<Bet> {
    const bet = await this.getById(betId);

    if (bet.status !== 'requires_review') {
      throw new ConflictException(
        'Only a bet flagged for manual review can be resolved this way',
      );
    }

    const targetStatus: BetStatus =
      resolution === 'win'
        ? 'won'
        : resolution === 'loss'
          ? 'lost'
          : 'void';

    assertLegalBetTransition(
      'requires_review',
      targetStatus,
    );

    const idempotencyKey =
      `bet_manual_settlement:${bet.id}`;

    return this.db
      .transaction(async (tx) => {
        const t = tx as unknown as DrizzleDb;

        const ledgerTx =
          await (
            resolution === 'win'
              ? this.transactionService.settleBetWin(
                  {
                    userId: bet.userId,
                    currency: bet.currency,
                    stakeAmount: bet.stakeAmount,
                    payoutAmount: bet.potentialPayout,
                    actorType: 'admin',
                    actorUserId,
                    reason,
                    relatedType: 'bet',
                    relatedId: bet.id,
                    idempotencyKey,
                  },
                  t,
                )
              : resolution === 'loss'
                ? this.transactionService.settleBetLoss(
                    {
                      userId: bet.userId,
                      currency: bet.currency,
                      amount: bet.stakeAmount,
                      actorType: 'admin',
                      actorUserId,
                      reason,
                      relatedType: 'bet',
                      relatedId: bet.id,
                      idempotencyKey,
                    },
                    t,
                  )
                : this.transactionService.refundBet(
                    {
                      userId: bet.userId,
                      currency: bet.currency,
                      amount: bet.stakeAmount,
                      actorType: 'admin',
                      actorUserId,
                      reason,
                      relatedType: 'bet',
                      relatedId: bet.id,
                      idempotencyKey,
                    },
                    t,
                  )
          );

        const [updated] = await t
          .update(bets)
          .set({
            status: targetStatus,
            result:
              resolution === 'void'
                ? 'push'
                : resolution,
            settledAt: new Date(),
            settlementTransactionId: ledgerTx.id,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(bets.id, betId),
              eq(bets.status, 'requires_review'),
            ),
          )
          .returning();

        if (!updated) {
          throw new ConflictException(
            'Bet status changed before the manual review could be resolved',
          );
        }

        await this.recordAudit(t, {
          bet: updated,
          outcome:
            resolution === 'void'
              ? 'push'
              : resolution,
          finalStatus: targetStatus,
          computedPayout:
            resolution === 'win'
              ? bet.potentialPayout
              : null,
          settlementTransactionId: ledgerTx.id,
          isManualResolution: true,
          actorUserId,
        });

        await this.auditLog.record({
          actorUserId,
          action: 'bet.manual_review_resolved',
          targetType: 'bet',
          targetId: betId,
          before: {
            status: 'requires_review',
          },
          after: {
            status: targetStatus,
            resolution,
            reason,
          },
        });

        return updated;
      })
      .then((updated) => {
        this.emitBetEvent(updated);
        return updated;
      });
  }

  // ---------------------------------------------------------------------------
  // Settlement internals
  // ---------------------------------------------------------------------------

  private emitBetEvent(bet: Bet): void {
    const event = buildBetEvent(bet);
    this.events.emit(event.type, event);
  }

  /**
   * Atomically claims an open bet for settlement.
   *
   * Only one concurrent caller can transition the bet from
   * `open` to `pending`.
   */
  private async claim(
    betId: string,
  ): Promise<Bet | undefined> {
    const [claimed] = await this.db
      .update(bets)
      .set({
        status: 'pending',
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(bets.id, betId),
          eq(bets.status, 'open'),
        ),
      )
      .returning();

    return claimed;
  }

  /**
   * Handles settlement failures.
   *
   * The failed attempt is recorded in the settlement audit table.
   *
   * Attempts 1 and 2:
   *   pending -> open
   *
   * Attempt 3:
   *   pending -> requires_review
   *
   * This prevents an unhealthy price feed or persistent data issue
   * from causing infinite retries.
   */
  private async handleSettlementFailure(
    bet: Bet,
    error: unknown,
  ): Promise<void> {
    const priorFailures =
      await this.countFailedAttempts(bet.id);

    const attempt = priorFailures + 1;

    const errorMessage =
      error instanceof Error
        ? error.message
        : String(error);

    const errorCode =
      typeof error === 'object' &&
      error !== null &&
      'code' in error
        ? String(
            (error as { code: unknown }).code,
          )
        : undefined;

    const requiresReview =
      attempt >= MAX_SETTLEMENT_ATTEMPTS;

    const nextStatus: BetStatus =
      requiresReview
        ? 'requires_review'
        : 'open';

    const [updated] = await this.db
      .update(bets)
      .set({
        status: nextStatus,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(bets.id, bet.id),
          eq(bets.status, 'pending'),
        ),
      )
      .returning();

    await this.recordAudit(this.db, {
      bet: updated ?? bet,
      outcome: 'failed',
      finalStatus: requiresReview
        ? 'requires_review'
        : undefined,
      computedPayout: null,
      isManualResolution: false,
      errorCode,
      errorMessage,
    });

    if (requiresReview) {
      this.logger.error(
        `Bet ${bet.id} flagged for manual review after ${attempt} failed settlement attempts: ${errorMessage}`,
      );

      await this.auditLog.record({
        actorUserId: null,
        actorType: 'system',
        action: 'bet.flagged_for_review',
        targetType: 'bet',
        targetId: bet.id,
        after: {
          attempts: attempt,
          reason: errorMessage,
        },
      });

      if (updated) {
        this.emitBetEvent(updated);
      }
    } else {
      this.logger.warn(
        `Settlement attempt ${attempt} failed for bet ${bet.id}, released back to open for retry: ${errorMessage}`,
      );
    }
  }

  private async countFailedAttempts(
    betId: string,
  ): Promise<number> {
    const [row] = await this.db
      .select({
        total: sql<string>`count(*)`,
      })
      .from(betSettlementAudits)
      .where(
        and(
          eq(
            betSettlementAudits.betId,
            betId,
          ),
          eq(
            betSettlementAudits.outcome,
            'failed',
          ),
        ),
      );

    return Number(row?.total ?? 0);
  }

  /**
   * Performs the actual settlement.
   *
   * IMPORTANT:
   * The settlement price comes from the authoritative price-feed
   * service for the bet's expiry instant. It is never supplied by
   * the client and never replaced with the current market price.
   */
  private async process(
    bet: Bet,
  ): Promise<Bet> {
    const settlementQuote =
      await this.priceFeedService.getPriceForSettlement(
        bet.instrumentId,
        bet.expiresAt,
      );

    const contract =
      this.contractRegistry.get(bet.type);

    /**
     * PriceQuote.price is a string.
     *
     * Convert it explicitly using the quote's declared precision.
     * This replaces the old invalid:
     *
     * settlementQuote.price.toMinorUnits()
     */
    const settlementPriceMinorUnits =
      decimalToMinorUnits(
        settlementQuote.price,
        settlementQuote.pricePrecision,
      );

    const result = contract.determineResult({
      selection: bet.selection,
      targetPrice:
        bet.targetPrice ?? undefined,
      entryPrice: bet.entryPrice,
      settlementPrice:
        settlementPriceMinorUnits,
    });

    const idempotencyKey =
      `bet_settlement:${bet.id}`;

    return this.db.transaction(async (tx) => {
      const t = tx as unknown as DrizzleDb;

      if (result === 'win') {
        const ledgerTx =
          await this.transactionService.settleBetWin(
            {
              userId: bet.userId,
              currency: bet.currency,
              stakeAmount: bet.stakeAmount,
              payoutAmount: bet.potentialPayout,
              actorType: 'system',
              relatedType: 'bet',
              relatedId: bet.id,
              idempotencyKey,
            },
            t,
          );

        return this.finalize(
          t,
          bet,
          'won',
          result,
          settlementQuote,
          ledgerTx.id,
        );
      }

      if (result === 'loss') {
        const ledgerTx =
          await this.transactionService.settleBetLoss(
            {
              userId: bet.userId,
              currency: bet.currency,
              amount: bet.stakeAmount,
              actorType: 'system',
              relatedType: 'bet',
              relatedId: bet.id,
              idempotencyKey,
            },
            t,
          );

        return this.finalize(
          t,
          bet,
          'lost',
          result,
          settlementQuote,
          ledgerTx.id,
        );
      }

      const ledgerTx =
        await this.transactionService.refundBet(
          {
            userId: bet.userId,
            currency: bet.currency,
            amount: bet.stakeAmount,
            actorType: 'system',
            reason:
              'Push — settlement price equalled the entry/target price',
            relatedType: 'bet',
            relatedId: bet.id,
            idempotencyKey,
          },
          t,
        );

      return this.finalize(
        t,
        bet,
        'void',
        result,
        settlementQuote,
        ledgerTx.id,
      );
    });
  }

  private async finalize(
    tx: DrizzleDb,
    bet: Bet,
    status: 'won' | 'lost' | 'void',
    result: 'win' | 'loss' | 'push',
    settlementQuote: PriceQuote,
    settlementTransactionId: string,
  ): Promise<Bet> {
    assertLegalBetTransition(
      'pending',
      status,
    );

    /**
     * PriceQuote.price is a decimal string.
     *
     * Convert it using the precision attached to the quote.
     */
    const settlementPriceMinorUnits =
      decimalToMinorUnits(
        settlementQuote.price,
        settlementQuote.pricePrecision,
      );
    const [settled] = await tx
      .update(bets)
      .set({
        status,
        result,
        settlementPrice:
          settlementPriceMinorUnits,
        settlementPriceObservedAt:
          settlementQuote.observedAt,
        settledAt: new Date(),
        settlementTransactionId,
        updatedAt: new Date(),
      })
      .where(eq(bets.id, bet.id))
      .returning();

    if (!settled) {
      throw new Error(
        'Failed to finalize bet settlement',
      );
    }

    /**
     * Audit is written inside the same transaction as:
     *
     * - ledger settlement
     * - bet status update
     * - settlement price
     *
     * Therefore a successful audit row represents a committed
     * settlement.
     */
    await this.recordAudit(tx, {
      bet: settled,
      outcome: result,
      finalStatus: status,
      closing: settlementQuote,
      computedPayout:
        status === 'won'
          ? settled.potentialPayout
          : null,
      settlementTransactionId,
      isManualResolution: false,
    });

    return settled;
  }

  private async recordAudit(
    db: DrizzleDb,
    params: {
      bet: Bet;
      outcome:
        | 'win'
        | 'loss'
        | 'push'
        | 'failed';
      finalStatus?: BetStatus;
      closing?: PriceQuote;
      computedPayout: bigint | null;
      settlementTransactionId?: string;
      isManualResolution: boolean;
      actorUserId?: string;
      errorCode?: string;
      errorMessage?: string;
    },
  ): Promise<void> {
    await db
      .insert(betSettlementAudits)
      .values({
        betId: params.bet.id,

        calculationVersion:
          SETTLEMENT_CALCULATION_VERSION,

        openingPrice:
          params.bet.entryPrice,

        openingPriceSource:
          params.bet.entryPriceSource ??
          'unknown',

        openingPriceObservedAt:
          params.bet.entryPriceObservedAt,

        /**
         * PriceQuote.price is a string, so convert it
         * according to the quote's precision.
         */
        closingPrice: params.closing
          ? decimalToMinorUnits(
              params.closing.price,
              params.closing.pricePrecision,
            )
          : undefined,

        closingPriceSource:
          params.closing?.source,

        closingPriceObservedAt:
          params.closing?.observedAt,

        stakeAmount:
          params.bet.stakeAmount,

        payoutRateBasisPoints:
          params.bet.payoutRateBasisPoints,

        computedPayout:
          params.computedPayout,

        outcome:
          params.outcome,

        finalStatus:
          params.finalStatus,

        settlementTransactionId:
          params.settlementTransactionId,

        isManualResolution:
          params.isManualResolution,

        actorUserId:
          params.actorUserId,

        errorCode:
          params.errorCode,

        errorMessage:
          params.errorMessage,
      });
  }
}

