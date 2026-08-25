import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { Money, USD } from '@fenticoin/domain';

import type { Bet, Instrument, Transaction, User } from '../database/schema';
import type { DrizzleDb } from '../database/database.types';
import type { InstrumentService } from '../markets/instrument.service';
import type { PriceFeedService } from '../markets/price-feed.service';
import { StalePriceError } from '../markets/errors';
import { chainable } from '../test-utils/mock-drizzle';
import type { UsersService } from '../users/users.service';
import { InsufficientFundsError } from '../wallet/errors';
import type { TransactionService } from '../wallet/transaction.service';
import { BettingConfigService } from './betting-config.service';
import { BettingEligibilityService } from './betting-eligibility.service';
import { BettingService } from './betting.service';
import { BetContractRegistry } from './contracts/bet-contract.registry';
import { HigherLowerContract } from './contracts/higher-lower.contract';
import { RiseFallContract } from './contracts/rise-fall.contract';
import { UpDownContract } from './contracts/up-down.contract';
import { OddsEngine } from './odds-engine';

const NOW = new Date();

function user(overrides: Partial<User> = {}): User {
  return {
    id: 'user-1',
    email: 'u@example.com',
    emailVerifiedAt: null,
    phone: null,
    phoneVerifiedAt: null,
    status: 'active',
    kycStatus: 'unverified',
    eligibilityStatus: 'eligible',
    dateOfBirth: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  } as User;
}

function instrument(overrides: Partial<Instrument> = {}): Instrument {
  return {
    id: 'inst-btc',
    symbol: 'BTC',
    quoteCurrency: 'USD',
    displaySymbol: 'BTC/USD',
    name: 'Bitcoin',
    categoryKey: 'crypto',
    providerSymbol: 'bitcoin',
    pricePrecision: 2,
    status: 'active',
    maxPriceAgeSeconds: 30,
    tradingSchedule: null,
    createdBy: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  } as Instrument;
}

function bettingConfig(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'cfg-1',
    instrumentId: 'inst-btc',
    betType: 'rise_fall',
    minStake: 100n,
    maxStake: 100_000n,
    payoutRateBasisPoints: 8_500n,
    maxExposure: null,
    minDurationSeconds: 30n,
    maxDurationSeconds: 3_600n,
    isEnabled: true,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function priceQuote(priceMinorUnits = 11_250_000n) {
  return {
    instrumentId: 'inst-btc',
    price: Money.fromMinorUnits(priceMinorUnits, USD),
    source: 'test',
    observedAt: NOW,
    receivedAt: NOW,
    isStale: false,
  };
}

interface Harness {
  service: BettingService;
  db: { transaction: jest.Mock };
  tx: { insert: jest.Mock; update: jest.Mock };
  usersService: { findById: jest.Mock };
  instrumentService: { getById: jest.Mock };
  priceFeedService: { getLatestPrice: jest.Mock };
  bettingConfigService: { get: jest.Mock; getCurrentExposure: jest.Mock };
  transactionService: { placeBet: jest.Mock };
  insertChain: ReturnType<typeof chainable>;
}

function makeHarness(): Harness {
  const insertedBet: Partial<Bet> = { id: 'bet-1', status: 'open' };
  const linkedBet: Partial<Bet> = { id: 'bet-1', status: 'open', userId: 'user-1', updatedAt: NOW, placementTransactionId: 'txn-1' };

  const insertChain = chainable([insertedBet]);
  const tx = {
    insert: jest.fn().mockReturnValue(insertChain),
    update: jest.fn().mockReturnValue(chainable([linkedBet])),
  };
  const db = {
    transaction: jest.fn(async (cb: (tx: unknown) => unknown) => cb(tx)),
    select: jest.fn().mockReturnValue(chainable([])), // idempotency fast-path: none found by default
  };

  const usersService = { findById: jest.fn().mockResolvedValue(user()) };
  const eligibilityService = new BettingEligibilityService();
  const instrumentService = { getById: jest.fn().mockResolvedValue(instrument()) };
  const priceFeedService = { getLatestPrice: jest.fn().mockResolvedValue(priceQuote()) };
  const bettingConfigService = {
    get: jest.fn().mockResolvedValue(bettingConfig()),
    getCurrentExposure: jest.fn().mockResolvedValue(0n),
  };
  const contractRegistry = new BetContractRegistry(new RiseFallContract(), new HigherLowerContract(), new UpDownContract());
  const oddsEngine = new OddsEngine();
  const transactionService = {
    placeBet: jest.fn().mockResolvedValue({ id: 'txn-1' } as Transaction),
  };

  const service = new BettingService(
    db as unknown as DrizzleDb,
    usersService as unknown as UsersService,
    eligibilityService,
    instrumentService as unknown as InstrumentService,
    priceFeedService as unknown as PriceFeedService,
    bettingConfigService as unknown as BettingConfigService,
    contractRegistry,
    oddsEngine,
    transactionService as unknown as TransactionService,
    { emit: jest.fn() } as unknown as import('@nestjs/event-emitter').EventEmitter2,
  );

  return {
    service,
    db,
    tx,
    usersService,
    instrumentService,
    priceFeedService,
    bettingConfigService,
    transactionService,
    insertChain,
  };
}

function basePlaceInput(overrides: Partial<Parameters<BettingService['placeBet']>[0]> = {}) {
  return {
    userId: 'user-1',
    instrumentId: 'inst-btc',
    type: 'rise_fall' as const,
    selection: 'rise',
    stakeAmount: 1_000n,
    currency: 'USD',
    durationSeconds: 60n,
    ...overrides,
  };
}

describe('BettingService.placeBet', () => {
  it('places a valid bet and returns it, atomically reserving funds', async () => {
    const h = makeHarness();
    const result = await h.service.placeBet(basePlaceInput());

    expect(result.id).toBe('bet-1');
    expect(h.db.transaction).toHaveBeenCalled();
    expect(h.transactionService.placeBet).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1', currency: 'USD', amount: 1_000n, relatedType: 'bet' }),
      h.tx,
    );
    // The entry price's provider is persisted alongside it, so the settlement
    // audit trail can record "price-provider information" for the opening price too.
    expect(h.insertChain.values).toHaveBeenCalledWith(expect.objectContaining({ entryPriceSource: 'test' }));
  });

  it('rejects an invalid selection for the bet type (via the contract, before any DB write)', async () => {
    const h = makeHarness();
    await expect(h.service.placeBet(basePlaceInput({ selection: 'higher' }))).rejects.toThrow(BadRequestException);
    expect(h.db.transaction).not.toHaveBeenCalled();
  });

  it('rejects a stake below the configured minimum', async () => {
    const h = makeHarness();
    await expect(h.service.placeBet(basePlaceInput({ stakeAmount: 10n }))).rejects.toThrow(BadRequestException);
  });

  it('rejects a stake above the configured maximum', async () => {
    const h = makeHarness();
    await expect(h.service.placeBet(basePlaceInput({ stakeAmount: 1_000_000n }))).rejects.toThrow(
      BadRequestException,
    );
  });

  it('rejects placement on a suspended market', async () => {
    const h = makeHarness();
    h.instrumentService.getById.mockResolvedValue(instrument({ status: 'suspended' }));
    await expect(h.service.placeBet(basePlaceInput())).rejects.toThrow(ConflictException);
  });

  it('rejects an ineligible user before touching the market at all', async () => {
    const h = makeHarness();
    h.usersService.findById.mockResolvedValue(user({ eligibilityStatus: 'ineligible' }));
    await expect(h.service.placeBet(basePlaceInput())).rejects.toThrow(ForbiddenException);
    expect(h.instrumentService.getById).not.toHaveBeenCalled();
  });

  it('propagates insufficient-funds from the ledger without creating a dangling bet', async () => {
    const h = makeHarness();
    h.db.transaction.mockImplementationOnce(async () => {
      throw new InsufficientFundsError({ accountId: 'acct-1', requested: 1_000n, available: 100n });
    });
    await expect(h.service.placeBet(basePlaceInput())).rejects.toThrow(InsufficientFundsError);
  });

  it('rejects when the trusted price feed reports stale data instead of placing a bet on bad data', async () => {
    const h = makeHarness();
    h.priceFeedService.getLatestPrice.mockRejectedValue(
      new StalePriceError({ instrumentId: 'inst-btc', ageSeconds: 999, maxAgeSeconds: 30 }),
    );
    await expect(h.service.placeBet(basePlaceInput())).rejects.toThrow(StalePriceError);
  });

  it('rejects when placing would exceed the configured maximum exposure', async () => {
    const h = makeHarness();
    h.bettingConfigService.get.mockResolvedValue(bettingConfig({ maxExposure: 1_500n }));
    h.bettingConfigService.getCurrentExposure.mockResolvedValue(1_000n);
    await expect(h.service.placeBet(basePlaceInput({ stakeAmount: 1_000n }))).rejects.toThrow(ConflictException);
  });

  it('allows placement when the new stake keeps exposure within the limit', async () => {
    const h = makeHarness();
    h.bettingConfigService.get.mockResolvedValue(bettingConfig({ maxExposure: 5_000n }));
    h.bettingConfigService.getCurrentExposure.mockResolvedValue(1_000n);
    await expect(h.service.placeBet(basePlaceInput({ stakeAmount: 1_000n }))).resolves.toBeDefined();
  });

  it('rejects a currency that does not match the instrument quote currency', async () => {
    const h = makeHarness();
    await expect(h.service.placeBet(basePlaceInput({ currency: 'EUR' }))).rejects.toThrow(BadRequestException);
  });

  it('validates and scales a Higher/Lower targetPrice using the instrument precision', async () => {
    const h = makeHarness();
    h.bettingConfigService.get.mockResolvedValue(bettingConfig({ betType: 'higher_lower' }));

    await h.service.placeBet(
      basePlaceInput({ type: 'higher_lower', selection: 'higher', targetPrice: '113000.50' }),
    );

    expect(h.insertChain.values).toHaveBeenCalledWith(
      expect.objectContaining({ targetPrice: 11_300_050n }),
    );
  });

  describe('duplicate / concurrent placement (idempotency)', () => {
    it('returns the existing bet on a duplicate request without re-executing placement', async () => {
      const h = makeHarness();
      const existingBet = { id: 'bet-existing', idempotencyKey: 'key-1' } as Bet;
      (h.db as unknown as { select: jest.Mock }).select.mockReturnValue(chainable([existingBet]));

      const result = await h.service.placeBet(basePlaceInput({ idempotencyKey: 'key-1' }));
      expect(result).toBe(existingBet);
      expect(h.db.transaction).not.toHaveBeenCalled();
    });

    it('recovers from a concurrent duplicate insert (unique-violation race) by returning the winner', async () => {
      const h = makeHarness();
      const winnerBet = { id: 'bet-winner', idempotencyKey: 'key-2' } as Bet;

      h.db.transaction.mockImplementationOnce(async () => {
        const err = new Error('duplicate key value violates unique constraint') as Error & { code: string };
        err.code = '23505';
        throw err;
      });
      (h.db as unknown as { select: jest.Mock }).select.mockReturnValueOnce(chainable([])).mockReturnValueOnce(
        chainable([winnerBet]),
      );

      const result = await h.service.placeBet(basePlaceInput({ idempotencyKey: 'key-2' }));
      expect(result).toBe(winnerBet);
    });
  });
});

describe('BettingService.listAll — admin bet browsing', () => {
  it('runs unfiltered when no filters are provided (platform-wide)', async () => {
    const rows = [{ id: 'bet-1' } as Bet, { id: 'bet-2' } as Bet];
    const select = jest.fn().mockReturnValue(chainable(rows));
    const db = { select } as unknown as DrizzleDb;
    const service = new BettingService(
      db,
      {} as UsersService,
      {} as BettingEligibilityService,
      {} as InstrumentService,
      {} as PriceFeedService,
      {} as BettingConfigService,
      {} as BetContractRegistry,
      {} as OddsEngine,
      {} as TransactionService,
      { emit: jest.fn() } as unknown as import('@nestjs/event-emitter').EventEmitter2,
    );

    const result = await service.listAll({ limit: 25, offset: 0 });
    expect(result).toBe(rows);
  });

  it('composes status/userId/instrumentId filters independently when provided', async () => {
    const select = jest.fn().mockReturnValue(chainable([]));
    const db = { select } as unknown as DrizzleDb;
    const service = new BettingService(
      db,
      {} as UsersService,
      {} as BettingEligibilityService,
      {} as InstrumentService,
      {} as PriceFeedService,
      {} as BettingConfigService,
      {} as BetContractRegistry,
      {} as OddsEngine,
      {} as TransactionService,
      { emit: jest.fn() } as unknown as import('@nestjs/event-emitter').EventEmitter2,
    );

    await service.listAll({ limit: 25, offset: 0, status: 'requires_review', userId: 'user-1', instrumentId: 'inst-btc' });
    expect(select).toHaveBeenCalledTimes(1);
  });
});
