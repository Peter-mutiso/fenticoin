import { BadRequestException, ConflictException, Inject, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { and, desc, eq } from 'drizzle-orm';

import { DRIZZLE_CLIENT } from '../database/database.constants';
import type { DrizzleDb } from '../database/database.types';
import { ledgerEntries, type Transaction, type TransactionActorType, transactions } from '../database/schema';
import { buildWalletTransactionEvent } from '../realtime/realtime-events';
import { LedgerService, type LedgerEntryInput } from './ledger.service';
import { requireCurrency } from './wallet.constants';
import { WalletService } from './wallet.service';

const POSTGRES_UNIQUE_VIOLATION = '23505';

export interface TransactionMeta {
  idempotencyKey?: string;
  actorType: TransactionActorType;
  actorUserId?: string;
  reason?: string;
  relatedType?: string;
  relatedId?: string;
  metadata?: unknown;
}

export interface MoneyMovementInput extends TransactionMeta {
  userId: string;
  currency: string;
  amount: bigint;
}

export interface BetWinInput extends TransactionMeta {
  userId: string;
  currency: string;
  stakeAmount: bigint;
  payoutAmount: bigint;
}

export interface AdjustBalanceInput extends TransactionMeta {
  userId: string;
  currency: string;
  amount: bigint;
  direction: 'credit' | 'debit';
  reason: string; // mandatory for manual adjustments — no default
}

export interface ReverseTransactionInput {
  transactionId: string;
  actorUserId: string;
  reason: string;
  idempotencyKey?: string;
}

/**
 * Orchestrates every financial mutation: resolves the accounts involved,
 * computes the correct ledger entries for the transaction type, and posts
 * them atomically via `LedgerService` — all inside one DB transaction that
 * also creates the `transactions` row itself, so a crash or thrown error
 * anywhere in the middle rolls back everything, not just some of it.
 *
 * Idempotency: every method accepts an optional `idempotencyKey`. A
 * second call with the same key returns the original result without
 * re-executing the mutation — see `withIdempotency` below.
 *
 * Real-time `wallet.transaction_posted` emission: only the methods below
 * that own their own transaction (no optional `tx` parameter — `withdraw`,
 * `grantBonus`, `chargeFee`, `adjustBalance`, `reverseTransaction`,
 * `reverseCompletedWithdrawal`) emit here. The other methods (`deposit`,
 * `placeBet`, `settleBetWin`/`settleBetLoss`, the withdrawal hold/release/
 * settle trio) are always called with a caller-owned `tx` in this codebase
 * — the caller's own transaction hasn't committed yet when they return, so
 * emitting from inside them would risk announcing a change a later
 * statement in the *caller's* transaction could still roll back. Those are
 * instead covered by the caller's own domain event (`bet.updated`/
 * `bet.settled`/`deposit.status_changed`/`withdrawal.status_changed`),
 * which the frontend already treats as "also refetch the wallet" for
 * terminal transitions — see the real-time layer plan.
 */
@Injectable()
export class TransactionService {
  constructor(
    @Inject(DRIZZLE_CLIENT) private readonly db: DrizzleDb,
    private readonly walletService: WalletService,
    private readonly ledgerService: LedgerService,
    private readonly events: EventEmitter2,
  ) {}

  async deposit(input: MoneyMovementInput, tx?: DrizzleDb): Promise<Transaction> {
    this.assertPositiveAmount(input.amount);
    const currency = requireCurrency(input.currency);

    return this.withIdempotency(
      input.idempotencyKey,
      async (t) => {
        const accounts = await this.walletService.getOrCreateWalletAccounts(t, input.userId, currency.code);
        const houseCash = await this.walletService.getSystemAccount(t, 'house_cash', currency.code);

        const txRow = await this.insertTransactionRow(t, {
          type: 'deposit',
          currency: currency.code,
          totalAmount: input.amount,
          subjectUserId: input.userId,
          meta: input,
        });

        await this.ledgerService.postEntries(t, txRow.id, currency.code, [
          { ledgerAccountId: houseCash.id, direction: 'debit', amount: input.amount },
          { ledgerAccountId: accounts.available.id, direction: 'credit', amount: input.amount },
        ]);

        return txRow;
      },
      tx,
    );
  }

  /** Withdrawal request accepted: reserves the stake (available -> locked), same-currency internal transfer — no money has left the house yet. */
  async holdForWithdrawal(input: MoneyMovementInput, tx?: DrizzleDb): Promise<Transaction> {
    this.assertPositiveAmount(input.amount);
    const currency = requireCurrency(input.currency);

    return this.withIdempotency(
      input.idempotencyKey,
      async (t) => {
        const accounts = await this.walletService.getOrCreateWalletAccounts(t, input.userId, currency.code);

        const txRow = await this.insertTransactionRow(t, {
          type: 'withdrawal_hold',
          currency: currency.code,
          totalAmount: input.amount,
          subjectUserId: input.userId,
          meta: input,
        });

        // Insufficient-funds is enforced by LedgerService (the debit below
        // would take `available` negative) — no separate pre-check needed.
        await this.ledgerService.postEntries(t, txRow.id, currency.code, [
          { ledgerAccountId: accounts.available.id, direction: 'debit', amount: input.amount },
          { ledgerAccountId: accounts.locked.id, direction: 'credit', amount: input.amount },
        ]);

        return txRow;
      },
      tx,
    );
  }

  /** A held withdrawal did not proceed (rejected, or provider submission/settlement failed): returns the reservation to available. */
  async releaseWithdrawalHold(input: MoneyMovementInput, tx?: DrizzleDb): Promise<Transaction> {
    this.assertPositiveAmount(input.amount);
    const currency = requireCurrency(input.currency);

    return this.withIdempotency(
      input.idempotencyKey,
      async (t) => {
        const accounts = await this.walletService.getOrCreateWalletAccounts(t, input.userId, currency.code);

        const txRow = await this.insertTransactionRow(t, {
          type: 'withdrawal_release',
          currency: currency.code,
          totalAmount: input.amount,
          subjectUserId: input.userId,
          meta: input,
        });

        await this.ledgerService.postEntries(t, txRow.id, currency.code, [
          { ledgerAccountId: accounts.locked.id, direction: 'debit', amount: input.amount },
          { ledgerAccountId: accounts.available.id, direction: 'credit', amount: input.amount },
        ]);

        return txRow;
      },
      tx,
    );
  }

  /** A held withdrawal is confirmed settled by the provider: the reservation actually leaves the house (locked -> house_cash). */
  async settleWithdrawal(input: MoneyMovementInput, tx?: DrizzleDb): Promise<Transaction> {
    this.assertPositiveAmount(input.amount);
    const currency = requireCurrency(input.currency);

    return this.withIdempotency(
      input.idempotencyKey,
      async (t) => {
        const accounts = await this.walletService.getOrCreateWalletAccounts(t, input.userId, currency.code);
        const houseCash = await this.walletService.getSystemAccount(t, 'house_cash', currency.code);

        const txRow = await this.insertTransactionRow(t, {
          type: 'withdrawal_settlement',
          currency: currency.code,
          totalAmount: input.amount,
          subjectUserId: input.userId,
          meta: input,
        });

        await this.ledgerService.postEntries(t, txRow.id, currency.code, [
          { ledgerAccountId: accounts.locked.id, direction: 'debit', amount: input.amount },
          { ledgerAccountId: houseCash.id, direction: 'credit', amount: input.amount },
        ]);

        return txRow;
      },
      tx,
    );
  }

  /**
   * Reverses an already-*completed* withdrawal (e.g. the provider later
   * reports a clawback, or fraud is discovered after the fact) — credits
   * the amount straight back to the user's spendable `available` balance
   * (not `locked`: there is nothing "in progress" to re-reserve, the
   * funds should simply be usable again) and marks the original
   * settlement transaction `reversed`.
   */
  async reverseCompletedWithdrawal(input: {
    settlementTransactionId: string;
    userId: string;
    currency: string;
    amount: bigint;
    actorUserId: string;
    reason: string;
    idempotencyKey?: string;
  }): Promise<Transaction> {
    this.assertPositiveAmount(input.amount);
    const currency = requireCurrency(input.currency);

    return this.withIdempotency(input.idempotencyKey, async (tx) => {
      const [original] = await tx.select().from(transactions).where(eq(transactions.id, input.settlementTransactionId)).limit(1);
      if (!original) {
        throw new BadRequestException(`Transaction ${input.settlementTransactionId} not found`);
      }
      if (original.status !== 'posted') {
        throw new ConflictException(`Cannot reverse a transaction with status "${original.status}"`);
      }

      const accounts = await this.walletService.getOrCreateWalletAccounts(tx, input.userId, currency.code);
      const houseCash = await this.walletService.getSystemAccount(tx, 'house_cash', currency.code);

      const reversalRow = await this.insertTransactionRow(tx, {
        type: 'reversal',
        currency: currency.code,
        totalAmount: input.amount,
        subjectUserId: input.userId,
        meta: {
          actorType: 'admin',
          actorUserId: input.actorUserId,
          reason: input.reason,
          relatedType: 'transaction',
          relatedId: original.id,
          idempotencyKey: input.idempotencyKey,
        },
      });

      await tx.update(transactions).set({ reversalOfTransactionId: original.id }).where(eq(transactions.id, reversalRow.id));

      await this.ledgerService.postEntries(tx, reversalRow.id, currency.code, [
        { ledgerAccountId: houseCash.id, direction: 'debit', amount: input.amount },
        { ledgerAccountId: accounts.available.id, direction: 'credit', amount: input.amount },
      ]);

      await tx.update(transactions).set({ status: 'reversed' }).where(eq(transactions.id, original.id));

      return reversalRow;
    }).then((reversalRow) => {
      this.emitWalletEvent(reversalRow);
      return reversalRow;
    });
  }

  async withdraw(input: MoneyMovementInput): Promise<Transaction> {
    this.assertPositiveAmount(input.amount);
    const currency = requireCurrency(input.currency);

    return this.withIdempotency(input.idempotencyKey, async (tx) => {
      const accounts = await this.walletService.getOrCreateWalletAccounts(tx, input.userId, currency.code);
      const houseCash = await this.walletService.getSystemAccount(tx, 'house_cash', currency.code);

      const txRow = await this.insertTransactionRow(tx, {
        type: 'withdrawal',
        currency: currency.code,
        totalAmount: input.amount,
        subjectUserId: input.userId,
        meta: input,
      });

      // Insufficient-funds is enforced by LedgerService (the debit below
      // would take `available` negative) — no separate pre-check needed,
      // which avoids a check-then-act race between the check and the post.
      await this.ledgerService.postEntries(tx, txRow.id, currency.code, [
        { ledgerAccountId: accounts.available.id, direction: 'debit', amount: input.amount },
        { ledgerAccountId: houseCash.id, direction: 'credit', amount: input.amount },
      ]);

      return txRow;
    }).then((txRow) => {
      this.emitWalletEvent(txRow);
      return txRow;
    });
  }

  async placeBet(input: MoneyMovementInput, tx?: DrizzleDb): Promise<Transaction> {
    this.assertPositiveAmount(input.amount);
    const currency = requireCurrency(input.currency);

    return this.withIdempotency(
      input.idempotencyKey,
      async (t) => {
        const accounts = await this.walletService.getOrCreateWalletAccounts(t, input.userId, currency.code);

        const txRow = await this.insertTransactionRow(t, {
          type: 'bet_placement',
          currency: currency.code,
          totalAmount: input.amount,
          subjectUserId: input.userId,
          meta: input,
        });

        await this.ledgerService.postEntries(t, txRow.id, currency.code, [
          { ledgerAccountId: accounts.available.id, direction: 'debit', amount: input.amount },
          { ledgerAccountId: accounts.locked.id, direction: 'credit', amount: input.amount },
        ]);

        return txRow;
      },
      tx,
    );
  }

  async refundBet(input: MoneyMovementInput, tx?: DrizzleDb): Promise<Transaction> {
    this.assertPositiveAmount(input.amount);
    const currency = requireCurrency(input.currency);

    return this.withIdempotency(
      input.idempotencyKey,
      async (t) => {
        const accounts = await this.walletService.getOrCreateWalletAccounts(t, input.userId, currency.code);

        const txRow = await this.insertTransactionRow(t, {
          type: 'bet_refund',
          currency: currency.code,
          totalAmount: input.amount,
          subjectUserId: input.userId,
          meta: input,
        });

        await this.ledgerService.postEntries(t, txRow.id, currency.code, [
          { ledgerAccountId: accounts.locked.id, direction: 'debit', amount: input.amount },
          { ledgerAccountId: accounts.available.id, direction: 'credit', amount: input.amount },
        ]);

        return txRow;
      },
      tx,
    );
  }

  async settleBetLoss(input: MoneyMovementInput, tx?: DrizzleDb): Promise<Transaction> {
    this.assertPositiveAmount(input.amount);
    const currency = requireCurrency(input.currency);

    return this.withIdempotency(
      input.idempotencyKey,
      async (t) => {
        const accounts = await this.walletService.getOrCreateWalletAccounts(t, input.userId, currency.code);
        const houseRevenue = await this.walletService.getSystemAccount(t, 'house_revenue', currency.code);

        const txRow = await this.insertTransactionRow(t, {
          type: 'bet_loss',
          currency: currency.code,
          totalAmount: input.amount,
          subjectUserId: input.userId,
          meta: input,
        });

        await this.ledgerService.postEntries(t, txRow.id, currency.code, [
          { ledgerAccountId: accounts.locked.id, direction: 'debit', amount: input.amount },
          { ledgerAccountId: houseRevenue.id, direction: 'credit', amount: input.amount },
        ]);

        return txRow;
      },
      tx,
    );
  }

  async settleBetWin(input: BetWinInput, tx?: DrizzleDb): Promise<Transaction> {
    this.assertPositiveAmount(input.stakeAmount);
    if (input.payoutAmount < input.stakeAmount) {
      throw new BadRequestException('A winning payout cannot be less than the stake');
    }
    const currency = requireCurrency(input.currency);
    const profit = input.payoutAmount - input.stakeAmount;

    return this.withIdempotency(
      input.idempotencyKey,
      async (t) => {
        const accounts = await this.walletService.getOrCreateWalletAccounts(t, input.userId, currency.code);

        const txRow = await this.insertTransactionRow(t, {
          type: 'bet_win',
          currency: currency.code,
          totalAmount: input.payoutAmount,
          subjectUserId: input.userId,
          meta: input,
        });

        const entries: LedgerEntryInput[] = [
          { ledgerAccountId: accounts.locked.id, direction: 'debit', amount: input.stakeAmount },
          { ledgerAccountId: accounts.available.id, direction: 'credit', amount: input.payoutAmount },
        ];
        if (profit > 0n) {
          const houseLiability = await this.walletService.getSystemAccount(t, 'house_liability', currency.code);
          entries.push({ ledgerAccountId: houseLiability.id, direction: 'debit', amount: profit });
        }

        await this.ledgerService.postEntries(t, txRow.id, currency.code, entries);

        return txRow;
      },
      tx,
    );
  }

  async grantBonus(input: MoneyMovementInput): Promise<Transaction> {
    this.assertPositiveAmount(input.amount);
    if (!input.reason?.trim()) {
      throw new BadRequestException('A reason is required for a manual bonus grant');
    }
    const currency = requireCurrency(input.currency);

    return this.withIdempotency(input.idempotencyKey, async (tx) => {
      const accounts = await this.walletService.getOrCreateWalletAccounts(tx, input.userId, currency.code);
      const houseLiability = await this.walletService.getSystemAccount(tx, 'house_liability', currency.code);

      const txRow = await this.insertTransactionRow(tx, {
        type: 'bonus',
        currency: currency.code,
        totalAmount: input.amount,
        subjectUserId: input.userId,
        meta: input,
      });

      await this.ledgerService.postEntries(tx, txRow.id, currency.code, [
        { ledgerAccountId: houseLiability.id, direction: 'debit', amount: input.amount },
        { ledgerAccountId: accounts.available.id, direction: 'credit', amount: input.amount },
      ]);

      return txRow;
    }).then((txRow) => {
      this.emitWalletEvent(txRow);
      return txRow;
    });
  }

  async chargeFee(input: MoneyMovementInput): Promise<Transaction> {
    this.assertPositiveAmount(input.amount);
    const currency = requireCurrency(input.currency);

    return this.withIdempotency(input.idempotencyKey, async (tx) => {
      const accounts = await this.walletService.getOrCreateWalletAccounts(tx, input.userId, currency.code);
      const houseRevenue = await this.walletService.getSystemAccount(tx, 'house_revenue', currency.code);

      const txRow = await this.insertTransactionRow(tx, {
        type: 'fee',
        currency: currency.code,
        totalAmount: input.amount,
        subjectUserId: input.userId,
        meta: input,
      });

      await this.ledgerService.postEntries(tx, txRow.id, currency.code, [
        { ledgerAccountId: accounts.available.id, direction: 'debit', amount: input.amount },
        { ledgerAccountId: houseRevenue.id, direction: 'credit', amount: input.amount },
      ]);

      return txRow;
    }).then((txRow) => {
      this.emitWalletEvent(txRow);
      return txRow;
    });
  }

  async adjustBalance(input: AdjustBalanceInput): Promise<Transaction> {
    this.assertPositiveAmount(input.amount);
    if (!input.reason?.trim()) {
      throw new BadRequestException('A reason is required for manual balance adjustments');
    }
    const currency = requireCurrency(input.currency);

    return this.withIdempotency(input.idempotencyKey, async (tx) => {
      const accounts = await this.walletService.getOrCreateWalletAccounts(tx, input.userId, currency.code);

      const txRow = await this.insertTransactionRow(tx, {
        type: 'adjustment',
        currency: currency.code,
        totalAmount: input.amount,
        subjectUserId: input.userId,
        meta: input,
      });

      const entries: LedgerEntryInput[] =
        input.direction === 'credit'
          ? [
              {
                ledgerAccountId: (await this.walletService.getSystemAccount(tx, 'house_liability', currency.code)).id,
                direction: 'debit',
                amount: input.amount,
              },
              { ledgerAccountId: accounts.available.id, direction: 'credit', amount: input.amount },
            ]
          : [
              { ledgerAccountId: accounts.available.id, direction: 'debit', amount: input.amount },
              {
                ledgerAccountId: (await this.walletService.getSystemAccount(tx, 'house_revenue', currency.code)).id,
                direction: 'credit',
                amount: input.amount,
              },
            ];

      await this.ledgerService.postEntries(tx, txRow.id, currency.code, entries);

      return txRow;
    }).then((txRow) => {
      this.emitWalletEvent(txRow);
      return txRow;
    });
  }

  /**
   * Creates a new `reversal` transaction whose entries are the exact
   * negation of the original's — negating a balanced set is always still
   * balanced, so this works regardless of the original transaction's
   * type. The original transaction's `ledger_entries` are never touched;
   * only its `status` moves to `reversed`.
   */
  async reverseTransaction(input: ReverseTransactionInput): Promise<Transaction> {
    return this.withIdempotency(input.idempotencyKey, async (tx) => {
      const [original] = await tx.select().from(transactions).where(eq(transactions.id, input.transactionId)).limit(1);
      if (!original) {
        throw new BadRequestException(`Transaction ${input.transactionId} not found`);
      }
      if (original.status !== 'posted') {
        throw new ConflictException(`Cannot reverse a transaction with status "${original.status}"`);
      }
      if (!original.subjectUserId) {
        throw new ConflictException('Original transaction has no subject user to reverse against');
      }

      const originalEntries = await tx
        .select()
        .from(ledgerEntries)
        .where(eq(ledgerEntries.transactionId, original.id));
      if (originalEntries.length === 0) {
        throw new ConflictException('Original transaction has no ledger entries to reverse');
      }

      const reversalRow = await this.insertTransactionRow(tx, {
        type: 'reversal',
        currency: original.currency,
        totalAmount: original.totalAmount,
        subjectUserId: original.subjectUserId,
        meta: {
          actorType: 'admin',
          actorUserId: input.actorUserId,
          reason: input.reason,
          relatedType: 'transaction',
          relatedId: original.id,
        },
      });

      await tx.update(transactions).set({ reversalOfTransactionId: original.id }).where(eq(transactions.id, reversalRow.id));

      const negatedEntries: LedgerEntryInput[] = originalEntries.map((e) => ({
        ledgerAccountId: e.ledgerAccountId,
        direction: e.direction === 'debit' ? 'credit' : 'debit',
        amount: e.amount,
      }));

      await this.ledgerService.postEntries(tx, reversalRow.id, original.currency, negatedEntries);

      await tx.update(transactions).set({ status: 'reversed' }).where(eq(transactions.id, original.id));

      return reversalRow;
    }).then((reversalRow) => {
      this.emitWalletEvent(reversalRow);
      return reversalRow;
    });
  }

  async listForUser(userId: string, params: { limit: number; offset: number }): Promise<Transaction[]> {
    return this.db
      .select()
      .from(transactions)
      .where(eq(transactions.subjectUserId, userId))
      .orderBy(desc(transactions.createdAt))
      .limit(params.limit)
      .offset(params.offset);
  }

  // ---- shared plumbing --------------------------------------------------

  private emitWalletEvent(transaction: Transaction): void {
    const event = buildWalletTransactionEvent(transaction);
    this.events.emit(event.type, event);
  }

  private assertPositiveAmount(amount: bigint): void {
    if (amount <= 0n) {
      throw new BadRequestException('Amount must be positive');
    }
  }

  private async insertTransactionRow(
    tx: DrizzleDb,
    params: {
      type: Transaction['type'];
      currency: string;
      totalAmount: bigint;
      subjectUserId: string;
      meta: TransactionMeta;
    },
  ): Promise<Transaction> {
    const [row] = await tx
      .insert(transactions)
      .values({
        idempotencyKey: params.meta.idempotencyKey,
        type: params.type,
        status: 'posted',
        currency: params.currency,
        totalAmount: params.totalAmount,
        actorType: params.meta.actorType,
        actorUserId: params.meta.actorUserId,
        subjectUserId: params.subjectUserId,
        reason: params.meta.reason,
        relatedType: params.meta.relatedType,
        relatedId: params.meta.relatedId,
        metadata: params.meta.metadata,
        postedAt: new Date(),
      })
      .returning();

    if (!row) throw new Error('Failed to insert transaction row');
    return row;
  }

  /**
   * The idempotency guard shared by every mutation above:
   *  1. Fast path — if a transaction with this key already exists, return
   *     it without touching anything else.
   *  2. Otherwise run `fn` inside a DB transaction. If two requests with
   *     the same key race each other, one wins the unique-constraint
   *     insert and the other gets a unique-violation error on its own
   *     insert — which is caught here and turned into "fetch and return
   *     the winner's row" rather than an error, so neither request's
   *     caller ever sees a failure or a double-charge.
   */
  private async withIdempotency(
    idempotencyKey: string | undefined,
    fn: (tx: DrizzleDb) => Promise<Transaction>,
    externalTx?: DrizzleDb,
  ): Promise<Transaction> {
    if (idempotencyKey) {
      const existing = await this.findByIdempotencyKey(idempotencyKey);
      if (existing) return existing;
    }

    // Composed into a caller-owned transaction (e.g. `BettingService`
    // placing a bet + its ledger movement atomically): just participate —
    // the caller owns commit/rollback, so we don't wrap or swallow errors.
    if (externalTx) {
      return fn(externalTx);
    }

    try {
      return await this.db.transaction((tx) => fn(tx as unknown as DrizzleDb));
    } catch (error) {
      if (idempotencyKey && isUniqueViolation(error)) {
        const existing = await this.findByIdempotencyKey(idempotencyKey);
        if (existing) return existing;
      }
      throw error;
    }
  }

  private async findByIdempotencyKey(idempotencyKey: string): Promise<Transaction | undefined> {
    const [existing] = await this.db
      .select()
      .from(transactions)
      .where(and(eq(transactions.idempotencyKey, idempotencyKey)))
      .limit(1);
    return existing;
  }
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === POSTGRES_UNIQUE_VIOLATION;
}
