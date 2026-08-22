import { ConflictException } from '@nestjs/common';
import { Money, USD } from '@fenticoin/domain';

import type { AuditLogService } from '../audit/audit-log.service';
import type { Bet, Transaction } from '../database/schema';
import type { DrizzleDb } from '../database/database.types';
import { StalePriceError } from '../markets/errors';
import type { PriceFeedService } from '../markets/price-feed.service';
import { chainable, type ChainableMock } from '../test-utils/mock-drizzle';
import type { TransactionService } from '../wallet/transaction.service';
import { BetContractRegistry } from './contracts/bet-contract.registry';
import { HigherLowerContract } from './contracts/higher-lower.contract';
import { RiseFallContract } from './contracts/rise-fall.contract';
import { UpDownContract } from './contracts/up-down.contract';
import { SettlementService } from './settlement.service';

const NOW = new Date();

function openBet(overrides: Partial<Bet> = {}): Bet {
  return {
    id: 'bet-1',
    userId: 'user-1',
    instrumentId: 'inst-btc',
    type: 'rise_fall',
    selection: 'rise',
    stakeAmount: 1_000n,
    currency: 'USD',
    entryPrice: 11_000_000n,
    entryPriceObservedAt: NOW,
    entryPriceSource: 'test-provider',
    targetPrice: null,
    payoutRateBasisPoints: 8_500n,
    potentialPayout: 1_850n,
    status: 'open',
    result: null,
    placedAt: NOW,
    expiresAt: NOW,
    settlementPrice: null,
    settlementPriceObservedAt: null,
    settledAt: null,
    placementTransactionId: 'txn-placement',
    settlementTransactionId: null,
    idempotencyKey: null,
    cancelReason: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  } as Bet;
}

function settlementQuote(priceMinorUnits: bigint, source = 'test-provider') {
  return {
    instrumentId: 'inst-btc',
    price: Money.fromMinorUnits(priceMinorUnits, USD),
    source,
    observedAt: NOW,
    receivedAt: NOW,
    isStale: false,
  };
}

interface Harness {
  service: SettlementService;
  db: { transaction: jest.Mock; update: jest.Mock; select: jest.Mock; insert: jest.Mock };
  /** The `tx` object handed to whatever callback is passed to `db.transaction` — configure per test. */
  tx: { update: jest.Mock; insert: jest.Mock };
  /** Default chain returned by `db.insert(...)` — assert audit rows written outside a transaction (failure path) against `.values`. */
  insertChain: ChainableMock;
  /** Default chain returned by `tx.insert(...)` — assert audit rows written inside a transaction (success / manual resolution) against `.values`. */
  txInsertChain: ChainableMock;
  priceFeedService: { getPriceForSettlement: jest.Mock };
  transactionService: {
    settleBetWin: jest.Mock;
    settleBetLoss: jest.Mock;
    refundBet: jest.Mock;
    reverseTransaction: jest.Mock;
  };
  auditLog: { record: jest.Mock };
}

function makeHarness(): Harness {
  const txInsertChain = chainable(undefined);
  const tx = { update: jest.fn(), insert: jest.fn().mockReturnValue(txInsertChain) };

  const insertChain = chainable(undefined);
  const db = {
    transaction: jest.fn(async (cb: (tx: unknown) => unknown) => cb(tx)),
    update: jest.fn(),
    // Default: "no prior failed settlement attempts" for countFailedAttempts —
    // most tests don't care about this and only override it when they do.
    select: jest.fn().mockReturnValue(chainable([{ total: '0' }])),
    insert: jest.fn().mockReturnValue(insertChain),
  };

  const priceFeedService = { getPriceForSettlement: jest.fn().mockResolvedValue(settlementQuote(11_100_000n)) };
  const transactionService = {
    settleBetWin: jest.fn().mockResolvedValue({ id: 'txn-win' } as Transaction),
    settleBetLoss: jest.fn().mockResolvedValue({ id: 'txn-loss' } as Transaction),
    refundBet: jest.fn().mockResolvedValue({ id: 'txn-refund' } as Transaction),
    reverseTransaction: jest.fn().mockResolvedValue({ id: 'txn-reversal' } as Transaction),
  };
  const auditLog = { record: jest.fn() };
  const contractRegistry = new BetContractRegistry(new RiseFallContract(), new HigherLowerContract(), new UpDownContract());

  const service = new SettlementService(
    db as unknown as DrizzleDb,
    priceFeedService as unknown as PriceFeedService,
    contractRegistry,
    transactionService as unknown as TransactionService,
    auditLog as unknown as AuditLogService,
    { emit: jest.fn() } as unknown as import('@nestjs/event-emitter').EventEmitter2,
  );

  return { service, db, tx, insertChain, txInsertChain, priceFeedService, transactionService, auditLog };
}

/** `db.update(...).set(...).where(...).returning()` — resolves to `rows`. */
function updateReturning(rows: unknown[]): ChainableMock {
  return chainable(rows);
}

describe('SettlementService', () => {
  describe('settleBet — winning bet', () => {
    it('claims the bet, pays out via settleBetWin, and finalizes status=won result=win, recording the audit trail', async () => {
      const h = makeHarness();
      const bet = openBet({ entryPrice: 11_000_000n });
      h.db.update.mockReturnValueOnce(updateReturning([bet])); // claim: open -> pending
      h.tx.update.mockReturnValueOnce(updateReturning([{ ...bet, status: 'won', result: 'win' }])); // finalize
      h.priceFeedService.getPriceForSettlement.mockResolvedValue(settlementQuote(11_100_000n, 'coingecko')); // rose

      const result = await h.service.settleBet('bet-1');

      expect(h.transactionService.settleBetWin).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-1',
          stakeAmount: 1_000n,
          payoutAmount: 1_850n,
          idempotencyKey: 'bet_settlement:bet-1',
        }),
        h.tx,
      );
      expect(result.status).toBe('won');

      // Settlement metadata + audit trail — written inside the same transaction as the payout.
      expect(h.txInsertChain.values).toHaveBeenCalledWith(
        expect.objectContaining({
          betId: 'bet-1',
          calculationVersion: 1,
          openingPrice: 11_000_000n,
          openingPriceSource: 'test-provider',
          closingPrice: 11_100_000n,
          closingPriceSource: 'coingecko',
          outcome: 'win',
          finalStatus: 'won',
          computedPayout: bet.potentialPayout,
          isManualResolution: false,
        }),
      );
    });
  });

  describe('settleBet — losing bet', () => {
    it('forfeits the stake via settleBetLoss and finalizes status=lost result=loss', async () => {
      const h = makeHarness();
      const bet = openBet({ entryPrice: 11_000_000n, selection: 'rise' });
      h.db.update.mockReturnValueOnce(updateReturning([bet]));
      h.tx.update.mockReturnValueOnce(updateReturning([{ ...bet, status: 'lost', result: 'loss' }]));
      h.priceFeedService.getPriceForSettlement.mockResolvedValue(settlementQuote(10_900_000n)); // fell

      const result = await h.service.settleBet('bet-1');

      expect(h.transactionService.settleBetLoss).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'user-1', amount: 1_000n, idempotencyKey: 'bet_settlement:bet-1' }),
        h.tx,
      );
      expect(h.transactionService.settleBetWin).not.toHaveBeenCalled();
      expect(result.status).toBe('lost');
      expect(h.txInsertChain.values).toHaveBeenCalledWith(
        expect.objectContaining({ outcome: 'loss', finalStatus: 'lost', computedPayout: null }),
      );
    });
  });

  describe('settleBet — void / push / refund', () => {
    it('refunds the stake via refundBet when settlement price equals entry price', async () => {
      const h = makeHarness();
      const bet = openBet({ entryPrice: 11_000_000n });
      h.db.update.mockReturnValueOnce(updateReturning([bet]));
      h.tx.update.mockReturnValueOnce(updateReturning([{ ...bet, status: 'void', result: 'push' }]));
      h.priceFeedService.getPriceForSettlement.mockResolvedValue(settlementQuote(11_000_000n)); // exact tie

      const result = await h.service.settleBet('bet-1');

      expect(h.transactionService.refundBet).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'user-1', amount: 1_000n, idempotencyKey: 'bet_settlement:bet-1' }),
        h.tx,
      );
      expect(h.transactionService.settleBetWin).not.toHaveBeenCalled();
      expect(h.transactionService.settleBetLoss).not.toHaveBeenCalled();
      expect(result.status).toBe('void');
      expect(h.txInsertChain.values).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'push', finalStatus: 'void' }));
    });
  });

  describe('settleBet — duplicate settlement', () => {
    it('is a no-op for a bet that is not open (claim fails, nothing is re-posted)', async () => {
      const h = makeHarness();
      h.db.update.mockReturnValueOnce(updateReturning([])); // claim fails: not open
      h.db.select.mockReturnValueOnce(updateReturning([openBet({ status: 'won', result: 'win' })])); // getById fallback

      const result = await h.service.settleBet('bet-1');

      expect(result.status).toBe('won');
      expect(h.transactionService.settleBetWin).not.toHaveBeenCalled();
      expect(h.transactionService.settleBetLoss).not.toHaveBeenCalled();
      expect(h.transactionService.refundBet).not.toHaveBeenCalled();
    });
  });

  describe('settleBet — simultaneous settlement workers', () => {
    it('only one of two concurrent settlement attempts for the same bet actually processes it', async () => {
      const h = makeHarness();
      const bet = openBet();
      // Worker A's conditional claim UPDATE wins the row; worker B's affects zero rows —
      // exactly what a real `WHERE status = 'open'` race resolves to in Postgres.
      h.db.update.mockReturnValueOnce(updateReturning([bet])); // worker A claims
      h.db.update.mockReturnValueOnce(updateReturning([])); // worker B fails to claim
      h.tx.update.mockReturnValueOnce(updateReturning([{ ...bet, status: 'won', result: 'win' }])); // worker A finalizes
      h.db.select.mockReturnValueOnce(updateReturning([{ ...bet, status: 'won', result: 'win' }])); // worker B's getById fallback

      const [resultA, resultB] = await Promise.all([h.service.settleBet('bet-1'), h.service.settleBet('bet-1')]);

      expect(resultA.status).toBe('won');
      expect(resultB.status).toBe('won');
      expect(h.transactionService.settleBetWin).toHaveBeenCalledTimes(1);
    });
  });

  describe('settleBet — expired bet', () => {
    it('settles using the price nearest the bet\'s expiresAt, not "now"', async () => {
      const h = makeHarness();
      const past = new Date(Date.now() - 60_000);
      const bet = openBet({ expiresAt: past, entryPrice: 100n });
      h.db.update.mockReturnValueOnce(updateReturning([bet]));
      h.tx.update.mockReturnValueOnce(updateReturning([{ ...bet, status: 'won', result: 'win' }]));
      h.priceFeedService.getPriceForSettlement.mockResolvedValue(settlementQuote(110n));

      await h.service.settleBet('bet-1');

      expect(h.priceFeedService.getPriceForSettlement).toHaveBeenCalledWith('inst-btc', past);
    });
  });

  describe('settleBet — provider failure', () => {
    it('releases the claim back to open and records a failed audit attempt when the price provider errors', async () => {
      const h = makeHarness();
      const bet = openBet();
      h.db.update.mockReturnValueOnce(updateReturning([bet])); // claim succeeds
      h.priceFeedService.getPriceForSettlement.mockRejectedValue(new Error('provider network error'));
      const releaseChain = updateReturning([{ ...bet, status: 'open' }]);
      h.db.update.mockReturnValueOnce(releaseChain); // release back to open

      await expect(h.service.settleBet('bet-1')).rejects.toThrow('provider network error');

      expect(releaseChain.set).toHaveBeenCalledWith(expect.objectContaining({ status: 'open' }));
      expect(h.transactionService.settleBetWin).not.toHaveBeenCalled();
      expect(h.transactionService.settleBetLoss).not.toHaveBeenCalled();
      expect(h.transactionService.refundBet).not.toHaveBeenCalled();
      expect(h.insertChain.values).toHaveBeenCalledWith(
        expect.objectContaining({ betId: 'bet-1', outcome: 'failed', errorMessage: 'provider network error' }),
      );
    });
  });

  describe('settleBet — stale price', () => {
    it('treats a stale-price rejection the same as any other settlement failure — release and retry, never settle on bad data', async () => {
      const h = makeHarness();
      const bet = openBet();
      h.db.update.mockReturnValueOnce(updateReturning([bet]));
      h.priceFeedService.getPriceForSettlement.mockRejectedValue(
        new StalePriceError({ instrumentId: 'inst-btc', ageSeconds: 999, maxAgeSeconds: 30 }),
      );
      const releaseChain = updateReturning([{ ...bet, status: 'open' }]);
      h.db.update.mockReturnValueOnce(releaseChain);

      await expect(h.service.settleBet('bet-1')).rejects.toThrow(StalePriceError);

      expect(releaseChain.set).toHaveBeenCalledWith(expect.objectContaining({ status: 'open' }));
      expect(h.transactionService.settleBetWin).not.toHaveBeenCalled();
      expect(h.insertChain.values).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'failed' }));
    });
  });

  describe('settleBet — transaction rollback', () => {
    it('rolls back the whole settlement transaction if posting the ledger entry throws, leaving no partial state', async () => {
      const h = makeHarness();
      const bet = openBet();
      h.db.update.mockReturnValueOnce(updateReturning([bet])); // claim succeeds
      h.transactionService.settleBetWin.mockRejectedValueOnce(new Error('ledger post failed'));
      const releaseChain = updateReturning([{ ...bet, status: 'open' }]);
      h.db.update.mockReturnValueOnce(releaseChain);

      await expect(h.service.settleBet('bet-1')).rejects.toThrow('ledger post failed');

      // Nothing inside the (rolled-back) transaction ran: no finalize, no in-transaction audit row.
      expect(h.tx.update).not.toHaveBeenCalled();
      expect(h.tx.insert).not.toHaveBeenCalled();
      // The claim is released and a failure is recorded — outside the failed transaction.
      expect(releaseChain.set).toHaveBeenCalledWith(expect.objectContaining({ status: 'open' }));
      expect(h.insertChain.values).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'failed', errorMessage: 'ledger post failed' }));
    });
  });

  describe('settleBet — escalation to manual review', () => {
    it('flags the bet for manual review after repeated failures instead of retrying forever', async () => {
      const h = makeHarness();
      const bet = openBet();
      h.db.update.mockReturnValueOnce(updateReturning([bet])); // claim succeeds
      h.priceFeedService.getPriceForSettlement.mockRejectedValue(new Error('feed still down'));
      h.db.select.mockReturnValueOnce(updateReturning([{ total: '2' }])); // two prior failed attempts already on record
      const reviewChain = updateReturning([{ ...bet, status: 'requires_review' }]);
      h.db.update.mockReturnValueOnce(reviewChain);

      await expect(h.service.settleBet('bet-1')).rejects.toThrow('feed still down');

      expect(reviewChain.set).toHaveBeenCalledWith(expect.objectContaining({ status: 'requires_review' }));
      expect(h.insertChain.values).toHaveBeenCalledWith(
        expect.objectContaining({ outcome: 'failed', finalStatus: 'requires_review' }),
      );
      expect(h.auditLog.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'bet.flagged_for_review', targetId: 'bet-1' }),
      );
    });

    it('keeps retrying (releases to open) below the failure threshold', async () => {
      const h = makeHarness();
      const bet = openBet();
      h.db.update.mockReturnValueOnce(updateReturning([bet]));
      h.priceFeedService.getPriceForSettlement.mockRejectedValue(new Error('transient error'));
      h.db.select.mockReturnValueOnce(updateReturning([{ total: '1' }])); // only one prior failure
      const releaseChain = updateReturning([{ ...bet, status: 'open' }]);
      h.db.update.mockReturnValueOnce(releaseChain);

      await expect(h.service.settleBet('bet-1')).rejects.toThrow('transient error');

      expect(releaseChain.set).toHaveBeenCalledWith(expect.objectContaining({ status: 'open' }));
    });
  });

  describe('cancelBet', () => {
    it('refuses to cancel a bet that is not open', async () => {
      const h = makeHarness();
      h.tx.update.mockReturnValueOnce(updateReturning([])); // conditional claim fails

      await expect(h.service.cancelBet('bet-1', 'admin-1', 'market issue')).rejects.toThrow(ConflictException);
      expect(h.transactionService.refundBet).not.toHaveBeenCalled();
    });

    it('refunds the stake and finalizes an open bet as cancelled', async () => {
      const h = makeHarness();
      const bet = openBet();
      h.tx.update
        .mockReturnValueOnce(updateReturning([{ ...bet, status: 'cancelled' }])) // claim
        .mockReturnValueOnce(updateReturning([{ ...bet, status: 'cancelled', settlementTransactionId: 'txn-refund' }])); // finalize

      const result = await h.service.cancelBet('bet-1', 'admin-1', 'market issue');

      expect(h.transactionService.refundBet).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'user-1', amount: 1_000n, actorType: 'admin', actorUserId: 'admin-1' }),
        h.tx,
      );
      expect(result.status).toBe('cancelled');
    });
  });

  describe('dispute resolution', () => {
    it('upholds the original result on "uphold"', async () => {
      const h = makeHarness();
      const bet = openBet({ status: 'disputed', result: 'win' });
      h.db.select.mockReturnValueOnce(updateReturning([bet])); // getById
      h.db.update.mockReturnValueOnce(updateReturning([{ ...bet, status: 'won' }]));

      const result = await h.service.resolveDispute('bet-1', 'uphold', 'admin-1', 'reviewed, correct');
      expect(result.status).toBe('won');
      expect(h.transactionService.reverseTransaction).not.toHaveBeenCalled();
    });

    it('reverses the settlement transaction and refunds on "reverse"', async () => {
      const h = makeHarness();
      const bet = openBet({ status: 'disputed', result: 'win', settlementTransactionId: 'txn-win' });
      h.db.select.mockReturnValueOnce(updateReturning([bet])); // getById
      h.db.update.mockReturnValueOnce(updateReturning([{ ...bet, status: 'refunded' }]));

      const result = await h.service.resolveDispute('bet-1', 'reverse', 'admin-1', 'error found on review');

      expect(h.transactionService.reverseTransaction).toHaveBeenCalledWith(
        expect.objectContaining({ transactionId: 'txn-win', idempotencyKey: 'bet_dispute_reverse:bet-1' }),
      );
      expect(result.status).toBe('refunded');
    });

    it('refuses to resolve a bet that is not disputed', async () => {
      const h = makeHarness();
      h.db.select.mockReturnValueOnce(updateReturning([openBet({ status: 'open' })]));

      await expect(h.service.resolveDispute('bet-1', 'uphold', 'admin-1', 'n/a')).rejects.toThrow(ConflictException);
    });
  });

  describe('resolveManualReview', () => {
    it('pays out a manually-confirmed win for a bet flagged for review', async () => {
      const h = makeHarness();
      const bet = openBet({ status: 'requires_review' });
      h.db.select.mockReturnValueOnce(updateReturning([bet])); // getById
      h.tx.update.mockReturnValueOnce(updateReturning([{ ...bet, status: 'won', result: 'win' }]));

      const result = await h.service.resolveManualReview('bet-1', 'win', 'admin-1', 'confirmed manually against exchange data');

      expect(h.transactionService.settleBetWin).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-1',
          payoutAmount: bet.potentialPayout,
          actorType: 'admin',
          actorUserId: 'admin-1',
          idempotencyKey: 'bet_manual_settlement:bet-1',
        }),
        h.tx,
      );
      expect(result.status).toBe('won');
      expect(h.txInsertChain.values).toHaveBeenCalledWith(
        expect.objectContaining({ outcome: 'win', isManualResolution: true, actorUserId: 'admin-1' }),
      );
    });

    it('forfeits the stake for a manually-confirmed loss', async () => {
      const h = makeHarness();
      const bet = openBet({ status: 'requires_review' });
      h.db.select.mockReturnValueOnce(updateReturning([bet]));
      h.tx.update.mockReturnValueOnce(updateReturning([{ ...bet, status: 'lost', result: 'loss' }]));

      const result = await h.service.resolveManualReview('bet-1', 'loss', 'admin-1', 'confirmed manually — bet lost');

      expect(h.transactionService.settleBetLoss).toHaveBeenCalled();
      expect(result.status).toBe('lost');
    });

    it('refunds the stake for a manually-confirmed void', async () => {
      const h = makeHarness();
      const bet = openBet({ status: 'requires_review' });
      h.db.select.mockReturnValueOnce(updateReturning([bet]));
      h.tx.update.mockReturnValueOnce(updateReturning([{ ...bet, status: 'void', result: 'push' }]));

      const result = await h.service.resolveManualReview('bet-1', 'void', 'admin-1', 'data unrecoverable, refunding');

      expect(h.transactionService.refundBet).toHaveBeenCalled();
      expect(result.status).toBe('void');
    });

    it('refuses to resolve a bet that is not flagged for review', async () => {
      const h = makeHarness();
      h.db.select.mockReturnValueOnce(updateReturning([openBet({ status: 'open' })]));

      await expect(h.service.resolveManualReview('bet-1', 'win', 'admin-1', 'n/a')).rejects.toThrow(ConflictException);
    });
  });

  describe('listRequiringReview / getSettlementAuditTrail', () => {
    it('lists bets currently flagged for manual review', async () => {
      const h = makeHarness();
      const rows = [openBet({ id: 'bet-9', status: 'requires_review' })];
      h.db.select.mockReturnValueOnce(chainable(rows));

      const result = await h.service.listRequiringReview();
      expect(result).toBe(rows);
    });

    it('returns the full settlement attempt history for a bet', async () => {
      const h = makeHarness();
      const rows = [{ id: 'audit-1', outcome: 'failed' }, { id: 'audit-2', outcome: 'win' }];
      h.db.select.mockReturnValueOnce(chainable(rows));

      const result = await h.service.getSettlementAuditTrail('bet-1');
      expect(result).toBe(rows);
    });
  });
});
