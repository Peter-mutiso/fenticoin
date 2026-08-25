import { BadRequestException, ConflictException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { and, desc, eq, lt } from 'drizzle-orm';

import { AuditLogService } from '../audit/audit-log.service';
import { DRIZZLE_CLIENT } from '../database/database.constants';
import type { DrizzleDb } from '../database/database.types';
import { type Deposit, type DepositStatus, deposits } from '../database/schema';
import { buildDepositEvent } from '../realtime/realtime-events';
import { UsersService } from '../users/users.service';
import { TransactionService } from '../wallet/transaction.service';
import { requireCurrency } from '../wallet/wallet.constants';
import { DepositEligibilityService } from './deposit-eligibility.service';
import { assertLegalDepositTransition } from './deposit-state-machine';
import { PaymentService } from './payment.service';
import { DEPOSIT_EXPIRY_MINUTES } from './payments.constants';

const POSTGRES_UNIQUE_VIOLATION = '23505';

export interface InitiateDepositInput {
  userId: string;
  currency: string;
  amountMinorUnits: bigint;
  idempotencyKey?: string;
}

export interface DepositVerificationOutcome {
  deposit: Deposit;
  /** True if the deposit was already in a terminal status when this call started — i.e. a duplicate/retried callback that changed nothing. */
  wasAlreadyResolved: boolean;
}

/**
 * Owns the deposit lifecycle: initiate -> pending -> completed/failed/
 * cancelled/expired. `completed` is only ever reached through
 * `verifyAndCompleteDeposit`, which always calls back to the provider for
 * an independent status check before crediting anything — see that
 * method and `payments/providers/payment-provider.interface.ts`'s
 * `verifyDeposit` doc comment for why.
 */
@Injectable()
export class DepositService {
  private readonly logger = new Logger(DepositService.name);

  constructor(
    @Inject(DRIZZLE_CLIENT) private readonly db: DrizzleDb,
    private readonly usersService: UsersService,
    private readonly eligibilityService: DepositEligibilityService,
    private readonly paymentService: PaymentService,
    private readonly transactionService: TransactionService,
    private readonly auditLog: AuditLogService,
    private readonly events: EventEmitter2,
  ) {}

  async initiateDeposit(input: InitiateDepositInput): Promise<Deposit> {
    if (input.amountMinorUnits <= 0n) throw new BadRequestException('Amount must be positive');
    requireCurrency(input.currency);

    if (input.idempotencyKey) {
      const existing = await this.findByIdempotencyKey(input.idempotencyKey);
      if (existing) return existing;
    }

    const user = await this.usersService.findById(input.userId);
    if (!user) throw new NotFoundException('User not found');
    this.eligibilityService.assertCanDeposit(user);

    // Talk to the provider before writing anything — if it throws
    // (including "not configured"), no row is persisted.
    const intent = await this.paymentService.createDeposit({
      userId: input.userId,
      currency: input.currency,
      amountMinorUnits: input.amountMinorUnits,
    });

    const expiresAt = new Date(Date.now() + DEPOSIT_EXPIRY_MINUTES * 60_000);

    try {
      const [deposit] = await this.db
        .insert(deposits)
        .values({
          userId: input.userId,
          currency: input.currency,
          amount: input.amountMinorUnits,
          status: 'pending',
          providerName: this.paymentService.providerName,
          providerReference: intent.providerReference,
          redirectUrl: intent.redirectUrl,
          expiresAt,
          idempotencyKey: input.idempotencyKey,
        })
        .returning();
      if (!deposit) throw new Error('Failed to create deposit');
      this.emitDepositEvent(deposit);
      return deposit;
    } catch (error) {
      if (isUniqueViolation(error)) {
        if (input.idempotencyKey) {
          const existing = await this.findByIdempotencyKey(input.idempotencyKey);
          if (existing) return existing;
        }
        const existing = await this.findByProviderReference(this.paymentService.providerName, intent.providerReference);
        if (existing) return existing;
      }
      throw error;
    }
  }

  async cancelDeposit(depositId: string, userId: string): Promise<Deposit> {
    const [updated] = await this.db
      .update(deposits)
      .set({ status: 'cancelled', updatedAt: new Date() })
      .where(and(eq(deposits.id, depositId), eq(deposits.userId, userId), eq(deposits.status, 'pending')))
      .returning();
    if (updated) {
      this.emitDepositEvent(updated);
      return updated;
    }

    const existing = await this.getById(depositId);
    if (existing.userId !== userId) throw new NotFoundException(`Deposit ${depositId} not found`);
    throw new ConflictException(`Only a pending deposit can be cancelled (current status: ${existing.status})`);
  }

  /**
   * The trusted completion path. Never trusts the webhook's claimed
   * amount/status directly — always re-asks the provider
   * (`PaymentService.verifyDeposit`) and only credits the wallet if that
   * independent check confirms `completed` with a matching amount and
   * currency. Idempotent: calling this again for an already-resolved
   * deposit is a safe no-op, and two concurrent calls can never both
   * credit the wallet (see `completeDeposit`'s atomic conditional update).
   */
  async verifyAndCompleteDeposit(providerReference: string): Promise<DepositVerificationOutcome> {
    const deposit = await this.getByProviderReference(this.paymentService.providerName, providerReference);

    if (deposit.status !== 'pending') {
      return { deposit, wasAlreadyResolved: true };
    }

    const verification = await this.paymentService.verifyDeposit(providerReference);

    if (verification.status === 'pending') {
      return { deposit, wasAlreadyResolved: false };
    }

    if (verification.status === 'failed') {
      return { deposit: await this.transitionToFailed(deposit, 'Provider reported this deposit as failed'), wasAlreadyResolved: false };
    }

    if (verification.amountMinorUnits !== deposit.amount || verification.currency !== deposit.currency) {
      return {
        deposit: await this.transitionToFailed(
          deposit,
          `Verified amount/currency (${verification.amountMinorUnits} minor units ${verification.currency}) did not match the recorded deposit (${deposit.amount} minor units ${deposit.currency})`,
        ),
        wasAlreadyResolved: false,
      };
    }

    return { deposit: await this.completeDeposit(deposit), wasAlreadyResolved: false };
  }

  /**
   * Admin-only manual resolution for a deposit stuck or ambiguous after
   * out-of-band investigation (e.g. the provider's own dashboard confirms
   * something automated verification couldn't). Deliberately skips
   * calling the provider again — the admin's investigation already did
   * that — but still goes through the same atomic completion path, and
   * is always attributed and audited.
   */
  async resolveManually(depositId: string, outcome: 'completed' | 'failed', actorUserId: string, reason: string): Promise<Deposit> {
    const deposit = await this.getById(depositId);
    if (deposit.status !== 'pending') {
      throw new ConflictException(`Only a pending deposit can be manually resolved (current status: ${deposit.status})`);
    }

    const resolved =
      outcome === 'completed' ? await this.completeDeposit(deposit, actorUserId) : await this.transitionToFailed(deposit, reason, actorUserId);

    await this.auditLog.record({
      actorUserId,
      action: 'deposit.manually_resolved',
      targetType: 'deposit',
      targetId: depositId,
      before: { status: 'pending' },
      after: { status: resolved.status, reason },
    });

    return resolved;
  }

  /** Scheduled sweep: pending deposits past their `expiresAt` are marked `expired` — call periodically. */
  async expireStaleDeposits(): Promise<number> {
    const now = new Date();
    const expired = await this.db
      .update(deposits)
      .set({ status: 'expired', updatedAt: now })
      .where(and(eq(deposits.status, 'pending'), lt(deposits.expiresAt, now)))
      .returning();
    if (expired.length > 0) {
      this.logger.warn(`Expired ${expired.length} stale pending deposit(s)`);
      for (const deposit of expired) this.emitDepositEvent(deposit);
    }
    return expired.length;
  }

  async getById(id: string): Promise<Deposit> {
    const [deposit] = await this.db.select().from(deposits).where(eq(deposits.id, id)).limit(1);
    if (!deposit) throw new NotFoundException(`Deposit ${id} not found`);
    return deposit;
  }

  async getByProviderReference(providerName: string, providerReference: string): Promise<Deposit> {
    const deposit = await this.findByProviderReference(providerName, providerReference);
    if (!deposit) throw new NotFoundException(`No deposit found for provider reference ${providerReference}`);
    return deposit;
  }

  async listForUser(userId: string, params: { limit: number; offset: number; status?: DepositStatus }): Promise<Deposit[]> {
    const conditions = [eq(deposits.userId, userId)];
    if (params.status) conditions.push(eq(deposits.status, params.status));
    return this.db
      .select()
      .from(deposits)
      .where(and(...conditions))
      .orderBy(desc(deposits.createdAt))
      .limit(params.limit)
      .offset(params.offset);
  }

  /** Admin view — optionally scoped to one user, otherwise platform-wide. */
  async listAll(params: { limit: number; offset: number; status?: DepositStatus; userId?: string }): Promise<Deposit[]> {
    const conditions = [];
    if (params.status) conditions.push(eq(deposits.status, params.status));
    if (params.userId) conditions.push(eq(deposits.userId, params.userId));
    return this.db
      .select()
      .from(deposits)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(deposits.createdAt))
      .limit(params.limit)
      .offset(params.offset);
  }

  // ---- internals ----------------------------------------------------------

  private emitDepositEvent(deposit: Deposit): void {
    const event = buildDepositEvent(deposit);
    this.events.emit(event.type, event);
  }

  private async completeDeposit(deposit: Deposit, actorUserId: string | null = null): Promise<Deposit> {
    assertLegalDepositTransition(deposit.status, 'completed');

    return this.db.transaction(async (tx) => {
      const t = tx as unknown as DrizzleDb;

      // The atomic guard: only one concurrent caller can ever win this
      // conditional update for a given deposit — everyone else affects
      // zero rows and falls through to "return current state", never
      // posting a second ledger transaction.
      const [claimed] = await t
        .update(deposits)
        .set({ status: 'completed', updatedAt: new Date() })
        .where(and(eq(deposits.id, deposit.id), eq(deposits.status, 'pending')))
        .returning();

      if (!claimed) {
        const [current] = await t.select().from(deposits).where(eq(deposits.id, deposit.id)).limit(1);
        if (!current) throw new Error(`Deposit ${deposit.id} vanished mid-completion`);
        return current;
      }

      const ledgerTx = await this.transactionService.deposit(
        {
          userId: claimed.userId,
          currency: claimed.currency,
          amount: claimed.amount,
          actorType: actorUserId ? 'admin' : 'system',
          actorUserId: actorUserId ?? undefined,
          relatedType: 'deposit',
          relatedId: claimed.id,
          idempotencyKey: `deposit_completion:${claimed.id}`,
        },
        t,
      );

      const [linked] = await t
        .update(deposits)
        .set({ transactionId: ledgerTx.id, updatedAt: new Date() })
        .where(eq(deposits.id, claimed.id))
        .returning();
      if (!linked) throw new Error('Failed to link deposit completion transaction');

      await this.auditLog.record({
        actorUserId,
        actorType: actorUserId ? 'admin' : 'system',
        action: 'deposit.completed',
        targetType: 'deposit',
        targetId: claimed.id,
        after: { amount: claimed.amount.toString(), currency: claimed.currency, transactionId: ledgerTx.id },
      }, t);

      return linked;
    }).then((linked) => {
      this.emitDepositEvent(linked);
      return linked;
    });
  }

  private async transitionToFailed(deposit: Deposit, reason: string, actorUserId: string | null = null): Promise<Deposit> {
    assertLegalDepositTransition(deposit.status, 'failed');

    const [updated] = await this.db
      .update(deposits)
      .set({ status: 'failed', failureReason: reason, updatedAt: new Date() })
      .where(and(eq(deposits.id, deposit.id), eq(deposits.status, 'pending')))
      .returning();

    const final = updated ?? (await this.getById(deposit.id));

    if (updated) {
      await this.auditLog.record({
        actorUserId,
        actorType: actorUserId ? 'admin' : 'system',
        action: 'deposit.failed',
        targetType: 'deposit',
        targetId: deposit.id,
        after: { reason },
      });
      this.emitDepositEvent(updated);
    }

    return final;
  }

  private async findByIdempotencyKey(idempotencyKey: string): Promise<Deposit | undefined> {
    const [existing] = await this.db.select().from(deposits).where(eq(deposits.idempotencyKey, idempotencyKey)).limit(1);
    return existing;
  }

  private async findByProviderReference(providerName: string, providerReference: string): Promise<Deposit | undefined> {
    const [existing] = await this.db
      .select()
      .from(deposits)
      .where(and(eq(deposits.providerName, providerName), eq(deposits.providerReference, providerReference)))
      .limit(1);
    return existing;
  }
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === POSTGRES_UNIQUE_VIOLATION;
}
