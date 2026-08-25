import { randomUUID } from 'node:crypto';

import { BadRequestException, ConflictException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { and, desc, eq, inArray } from 'drizzle-orm';

import { AuditLogService } from '../audit/audit-log.service';
import { DRIZZLE_CLIENT } from '../database/database.constants';
import type { DrizzleDb } from '../database/database.types';
import { type Withdrawal, type WithdrawalStatus, withdrawals } from '../database/schema';
import { buildWithdrawalEvent } from '../realtime/realtime-events';
import { UsersService } from '../users/users.service';
import { TransactionService } from '../wallet/transaction.service';
import { requireCurrency } from '../wallet/wallet.constants';
import { PaymentService } from './payment.service';
import { MAX_WITHDRAWAL_MINOR_UNITS, MIN_WITHDRAWAL_MINOR_UNITS } from './payments.constants';
import { assertLegalWithdrawalTransition } from './withdrawal-state-machine';
import { WithdrawalEligibilityService } from './withdrawal-eligibility.service';

const POSTGRES_UNIQUE_VIOLATION = '23505';

export interface RequestWithdrawalInput {
  userId: string;
  currency: string;
  amountMinorUnits: bigint;
  idempotencyKey?: string;
}

export interface WithdrawalVerificationOutcome {
  withdrawal: Withdrawal;
  /** True if the withdrawal was already resolved (no longer `submitted`) when this call started — a duplicate/retried callback that changed nothing. */
  wasAlreadyResolved: boolean;
}

/**
 * Owns the full withdrawal lifecycle: request -> eligibility check ->
 * hold funds -> pending review -> approve/reject -> provider submission
 * -> provider callback -> completed/failed -> optional later reversal.
 * Funds are reserved (available -> locked) at *request* time, before any
 * human review — see `TransactionService.holdForWithdrawal` — so a user
 * can never spend the same money elsewhere while a withdrawal is pending,
 * without a single cent actually leaving the house until the provider
 * independently confirms settlement.
 */
@Injectable()
export class WithdrawalService {
  private readonly logger = new Logger(WithdrawalService.name);

  constructor(
    @Inject(DRIZZLE_CLIENT) private readonly db: DrizzleDb,
    private readonly usersService: UsersService,
    private readonly eligibilityService: WithdrawalEligibilityService,
    private readonly paymentService: PaymentService,
    private readonly transactionService: TransactionService,
    private readonly auditLog: AuditLogService,
    private readonly events: EventEmitter2,
  ) {}

  async requestWithdrawal(input: RequestWithdrawalInput): Promise<Withdrawal> {
    if (input.idempotencyKey) {
      const existing = await this.findByIdempotencyKey(input.idempotencyKey);
      if (existing) return existing;
    }

    if (input.amountMinorUnits <= 0n) throw new BadRequestException('Amount must be positive');
    requireCurrency(input.currency);
    if (input.amountMinorUnits < MIN_WITHDRAWAL_MINOR_UNITS || input.amountMinorUnits > MAX_WITHDRAWAL_MINOR_UNITS) {
      throw new BadRequestException(
        `Amount must be between ${MIN_WITHDRAWAL_MINOR_UNITS} and ${MAX_WITHDRAWAL_MINOR_UNITS} minor units`,
      );
    }

    const user = await this.usersService.findById(input.userId);
    if (!user) throw new NotFoundException('User not found');
    this.eligibilityService.assertCanWithdraw(user);

    // Reserve funds and create the record atomically — mirrors
    // BettingService.placeBet. The id is generated up front so the hold
    // transaction's `relatedId` can point at it without a second write.
    const withdrawalId = randomUUID();

    try {
      const created = await this.db.transaction(async (tx) => {
        const t = tx as unknown as DrizzleDb;

        const holdTx = await this.transactionService.holdForWithdrawal(
          {
            userId: input.userId,
            currency: input.currency,
            amount: input.amountMinorUnits,
            actorType: 'user',
            actorUserId: input.userId,
            relatedType: 'withdrawal',
            relatedId: withdrawalId,
            idempotencyKey: input.idempotencyKey ? `withdrawal_hold:${input.idempotencyKey}` : undefined,
          },
          t,
        );

        const [withdrawal] = await t
          .insert(withdrawals)
          .values({
            id: withdrawalId,
            userId: input.userId,
            currency: input.currency,
            amount: input.amountMinorUnits,
            status: 'pending_review',
            holdTransactionId: holdTx.id,
            idempotencyKey: input.idempotencyKey,
          })
          .returning();
        if (!withdrawal) throw new Error('Failed to create withdrawal');

        return withdrawal;
      });
      this.emitWithdrawalEvent(created);
      return created;
    } catch (error) {
      if (input.idempotencyKey && isUniqueViolation(error)) {
        const existing = await this.findByIdempotencyKey(input.idempotencyKey);
        if (existing) return existing;
      }
      throw error;
    }
  }

  /** Admin decision on a withdrawal awaiting review. `reject` releases the held funds immediately; `approve` proceeds to provider submission. */
  async reviewWithdrawal(withdrawalId: string, decision: 'approve' | 'reject', actorUserId: string, reason?: string): Promise<Withdrawal> {
    const withdrawal = await this.getById(withdrawalId);
    if (withdrawal.status !== 'pending_review') {
      throw new ConflictException(`Only a withdrawal pending review can be ${decision}d (current status: ${withdrawal.status})`);
    }

    if (decision === 'reject') {
      if (!reason?.trim()) throw new BadRequestException('A reason is required to reject a withdrawal');
      assertLegalWithdrawalTransition('pending_review', 'rejected');

      return this.db.transaction(async (tx) => {
        const t = tx as unknown as DrizzleDb;
        const [updated] = await t
          .update(withdrawals)
          .set({ status: 'rejected', rejectionReason: reason, reviewedByUserId: actorUserId, reviewedAt: new Date(), updatedAt: new Date() })
          .where(and(eq(withdrawals.id, withdrawalId), eq(withdrawals.status, 'pending_review')))
          .returning();
        if (!updated) throw new ConflictException('Withdrawal status changed before it could be reviewed');

        const releaseTx = await this.transactionService.releaseWithdrawalHold(
          {
            userId: withdrawal.userId,
            currency: withdrawal.currency,
            amount: withdrawal.amount,
            actorType: 'admin',
            actorUserId,
            reason,
            relatedType: 'withdrawal',
            relatedId: withdrawalId,
            idempotencyKey: `withdrawal_release:${withdrawalId}`,
          },
          t,
        );

        const [linked] = await t
          .update(withdrawals)
          .set({ releaseTransactionId: releaseTx.id, updatedAt: new Date() })
          .where(eq(withdrawals.id, withdrawalId))
          .returning();
        if (!linked) throw new Error('Failed to link withdrawal release transaction');

        await this.auditLog.record({ actorUserId, action: 'withdrawal.rejected', targetType: 'withdrawal', targetId: withdrawalId, after: { reason } });
        return linked;
      }).then((linked) => {
        this.emitWithdrawalEvent(linked);
        return linked;
      });
    }

    assertLegalWithdrawalTransition('pending_review', 'approved');
    const [approved] = await this.db
      .update(withdrawals)
      .set({ status: 'approved', reviewedByUserId: actorUserId, reviewedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(withdrawals.id, withdrawalId), eq(withdrawals.status, 'pending_review')))
      .returning();
    if (!approved) throw new ConflictException('Withdrawal status changed before it could be reviewed');

    await this.auditLog.record({ actorUserId, action: 'withdrawal.approved', targetType: 'withdrawal', targetId: withdrawalId });
    this.emitWithdrawalEvent(approved);

    return this.submitToProvider(approved);
  }

  /**
   * The trusted settlement path, triggered by a provider webhook. Same
   * discipline as deposits: never trusts the webhook's claimed status —
   * always re-asks the provider independently before moving money out of
   * `locked`. Idempotent for duplicate/retried callbacks.
   */
  async verifyAndSettleWithdrawal(providerReference: string): Promise<WithdrawalVerificationOutcome> {
    const withdrawal = await this.getByProviderReference(this.paymentService.providerName, providerReference);

    if (withdrawal.status !== 'submitted') {
      return { withdrawal, wasAlreadyResolved: true };
    }

    const verification = await this.paymentService.verifyWithdrawal(providerReference);

    if (verification.status === 'pending') {
      return { withdrawal, wasAlreadyResolved: false };
    }

    if (verification.status === 'failed') {
      return { withdrawal: await this.failAndRelease(withdrawal, 'Provider reported this withdrawal as failed'), wasAlreadyResolved: false };
    }

    if (verification.amountMinorUnits !== withdrawal.amount || verification.currency !== withdrawal.currency) {
      return {
        withdrawal: await this.failAndRelease(
          withdrawal,
          `Verified amount/currency (${verification.amountMinorUnits} minor units ${verification.currency}) did not match the recorded withdrawal (${withdrawal.amount} minor units ${withdrawal.currency})`,
        ),
        wasAlreadyResolved: false,
      };
    }

    return { withdrawal: await this.completeWithdrawal(withdrawal), wasAlreadyResolved: false };
  }

  /** Admin-only: reverses an already-completed withdrawal (e.g. a provider clawback or fraud found after the fact). */
  async reverseWithdrawal(withdrawalId: string, actorUserId: string, reason: string): Promise<Withdrawal> {
    const withdrawal = await this.getById(withdrawalId);
    if (withdrawal.status !== 'completed') {
      throw new ConflictException(`Only a completed withdrawal can be reversed (current status: ${withdrawal.status})`);
    }
    if (!withdrawal.settlementTransactionId) {
      throw new ConflictException('Withdrawal has no settlement transaction to reverse');
    }
    assertLegalWithdrawalTransition('completed', 'reversed');

    const reversalTx = await this.transactionService.reverseCompletedWithdrawal({
      settlementTransactionId: withdrawal.settlementTransactionId,
      userId: withdrawal.userId,
      currency: withdrawal.currency,
      amount: withdrawal.amount,
      actorUserId,
      reason,
      idempotencyKey: `withdrawal_reversal:${withdrawalId}`,
    });

    const [updated] = await this.db
      .update(withdrawals)
      .set({ status: 'reversed', reversalTransactionId: reversalTx.id, updatedAt: new Date() })
      .where(and(eq(withdrawals.id, withdrawalId), eq(withdrawals.status, 'completed')))
      .returning();
    if (!updated) throw new ConflictException('Withdrawal status changed before it could be reversed');

    await this.auditLog.record({ actorUserId, action: 'withdrawal.reversed', targetType: 'withdrawal', targetId: withdrawalId, after: { reason } });
    this.emitWithdrawalEvent(updated);
    return updated;
  }

  async getById(id: string): Promise<Withdrawal> {
    const [withdrawal] = await this.db.select().from(withdrawals).where(eq(withdrawals.id, id)).limit(1);
    if (!withdrawal) throw new NotFoundException(`Withdrawal ${id} not found`);
    return withdrawal;
  }

  async getByProviderReference(providerName: string, providerReference: string): Promise<Withdrawal> {
    const withdrawal = await this.findByProviderReference(providerName, providerReference);
    if (!withdrawal) throw new NotFoundException(`No withdrawal found for provider reference ${providerReference}`);
    return withdrawal;
  }

  async listForUser(userId: string, params: { limit: number; offset: number; status?: WithdrawalStatus }): Promise<Withdrawal[]> {
    const conditions = [eq(withdrawals.userId, userId)];
    if (params.status) conditions.push(eq(withdrawals.status, params.status));
    return this.db
      .select()
      .from(withdrawals)
      .where(and(...conditions))
      .orderBy(desc(withdrawals.createdAt))
      .limit(params.limit)
      .offset(params.offset);
  }

  /** Admin view — optionally scoped to one user, otherwise platform-wide. */
  async listAll(params: { limit: number; offset: number; status?: WithdrawalStatus; userId?: string }): Promise<Withdrawal[]> {
    const conditions = [];
    if (params.status) conditions.push(eq(withdrawals.status, params.status));
    if (params.userId) conditions.push(eq(withdrawals.userId, params.userId));
    return this.db
      .select()
      .from(withdrawals)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(withdrawals.createdAt))
      .limit(params.limit)
      .offset(params.offset);
  }

  // ---- internals ----------------------------------------------------------

  private async submitToProvider(withdrawal: Withdrawal): Promise<Withdrawal> {
    try {
      const result = await this.paymentService.createWithdrawal({
        userId: withdrawal.userId,
        currency: withdrawal.currency,
        amountMinorUnits: withdrawal.amount,
      });

      assertLegalWithdrawalTransition('approved', 'submitted');
      const [updated] = await this.db
        .update(withdrawals)
        .set({
          status: 'submitted',
          providerName: this.paymentService.providerName,
          providerReference: result.providerReference,
          updatedAt: new Date(),
        })
        .where(and(eq(withdrawals.id, withdrawal.id), eq(withdrawals.status, 'approved')))
        .returning();
      if (!updated) throw new Error('Withdrawal status changed before provider submission could be recorded');

      await this.auditLog.record({
        actorUserId: null,
        actorType: 'system',
        action: 'withdrawal.submitted',
        targetType: 'withdrawal',
        targetId: withdrawal.id,
        after: { providerName: updated.providerName, providerReference: updated.providerReference },
      });

      this.emitWithdrawalEvent(updated);
      return updated;
    } catch (error) {
      this.logger.error(`Provider submission failed for withdrawal ${withdrawal.id}: ${String(error)}`);
      const reason = `Provider submission failed: ${error instanceof Error ? error.message : String(error)}`;
      return this.failAndRelease(withdrawal, reason);
    }
  }

  private async completeWithdrawal(withdrawal: Withdrawal): Promise<Withdrawal> {
    assertLegalWithdrawalTransition(withdrawal.status, 'completed');

    return this.db.transaction(async (tx) => {
      const t = tx as unknown as DrizzleDb;

      const [claimed] = await t
        .update(withdrawals)
        .set({ status: 'completed', updatedAt: new Date() })
        .where(and(eq(withdrawals.id, withdrawal.id), eq(withdrawals.status, 'submitted')))
        .returning();

      if (!claimed) {
        const [current] = await t.select().from(withdrawals).where(eq(withdrawals.id, withdrawal.id)).limit(1);
        if (!current) throw new Error(`Withdrawal ${withdrawal.id} vanished mid-completion`);
        return current;
      }

      const settlementTx = await this.transactionService.settleWithdrawal(
        {
          userId: claimed.userId,
          currency: claimed.currency,
          amount: claimed.amount,
          actorType: 'system',
          relatedType: 'withdrawal',
          relatedId: claimed.id,
          idempotencyKey: `withdrawal_settlement:${claimed.id}`,
        },
        t,
      );

      const [linked] = await t
        .update(withdrawals)
        .set({ settlementTransactionId: settlementTx.id, updatedAt: new Date() })
        .where(eq(withdrawals.id, claimed.id))
        .returning();
      if (!linked) throw new Error('Failed to link withdrawal settlement transaction');

      await this.auditLog.record({
        actorUserId: null,
        actorType: 'system',
        action: 'withdrawal.completed',
        targetType: 'withdrawal',
        targetId: claimed.id,
        after: { transactionId: settlementTx.id },
      });

      return linked;
    }).then((result) => {
      this.emitWithdrawalEvent(result);
      return result;
    });
  }

  /** Releases held funds and marks the withdrawal failed — used both when provider submission itself throws and when the provider later reports settlement failure. */
  private async failAndRelease(withdrawal: Withdrawal, reason: string, actorUserId: string | null = null): Promise<Withdrawal> {
    return this.db.transaction(async (tx) => {
      const t = tx as unknown as DrizzleDb;

      const [claimed] = await t
        .update(withdrawals)
        .set({ status: 'failed', failureReason: reason, updatedAt: new Date() })
        .where(and(eq(withdrawals.id, withdrawal.id), inArray(withdrawals.status, ['approved', 'submitted'])))
        .returning();

      if (!claimed) {
        const [current] = await t.select().from(withdrawals).where(eq(withdrawals.id, withdrawal.id)).limit(1);
        if (!current) throw new Error(`Withdrawal ${withdrawal.id} vanished mid-failure`);
        return current;
      }

      const releaseTx = await this.transactionService.releaseWithdrawalHold(
        {
          userId: claimed.userId,
          currency: claimed.currency,
          amount: claimed.amount,
          actorType: actorUserId ? 'admin' : 'system',
          actorUserId: actorUserId ?? undefined,
          reason,
          relatedType: 'withdrawal',
          relatedId: claimed.id,
          idempotencyKey: `withdrawal_release:${claimed.id}`,
        },
        t,
      );

      const [linked] = await t
        .update(withdrawals)
        .set({ releaseTransactionId: releaseTx.id, updatedAt: new Date() })
        .where(eq(withdrawals.id, claimed.id))
        .returning();
      if (!linked) throw new Error('Failed to link withdrawal release transaction');

      await this.auditLog.record({
        actorUserId,
        actorType: actorUserId ? 'user' : 'system',
        action: 'withdrawal.failed',
        targetType: 'withdrawal',
        targetId: claimed.id,
        after: { reason },
      });

      return linked;
    }).then((result) => {
      this.emitWithdrawalEvent(result);
      return result;
    });
  }

  private emitWithdrawalEvent(withdrawal: Withdrawal): void {
    const event = buildWithdrawalEvent(withdrawal);
    this.events.emit(event.type, event);
  }

  private async findByIdempotencyKey(idempotencyKey: string): Promise<Withdrawal | undefined> {
    const [existing] = await this.db.select().from(withdrawals).where(eq(withdrawals.idempotencyKey, idempotencyKey)).limit(1);
    return existing;
  }

  private async findByProviderReference(providerName: string, providerReference: string): Promise<Withdrawal | undefined> {
    const [existing] = await this.db
      .select()
      .from(withdrawals)
      .where(and(eq(withdrawals.providerName, providerName), eq(withdrawals.providerReference, providerReference)))
      .limit(1);
    return existing;
  }
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === POSTGRES_UNIQUE_VIOLATION;
}
