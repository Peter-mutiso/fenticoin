import type {
  Bet,
  Deposit,
  Instrument,
  PriceTick,
  Transaction,
  Withdrawal,
} from '../database/schema';

import {
  buildBetEvent,
  buildDepositEvent,
  buildInstrumentStatusEvent,
  buildMarketPriceEvent,
  buildNotificationEvent,
  buildWalletTransactionEvent,
  buildWithdrawalEvent,
  isSettledBetStatus,
  isTerminalDepositStatus,
  isTerminalWithdrawalStatus,
} from './realtime-events';

const NOW = new Date('2026-01-01T00:00:00.000Z');

function bet(overrides: Partial<Bet> = {}): Bet {
  return {
    id: 'bet-1',
    userId: 'user-1',
    status: 'open',
    updatedAt: NOW,
    settledAt: null,
    ...overrides,
  } as Bet;
}

function deposit(overrides: Partial<Deposit> = {}): Deposit {
  return {
    id: 'dep-1',
    userId: 'user-1',
    status: 'pending',
    updatedAt: NOW,
    ...overrides,
  } as Deposit;
}

function withdrawal(overrides: Partial<Withdrawal> = {}): Withdrawal {
  return {
    id: 'wd-1',
    userId: 'user-1',
    status: 'pending_review',
    updatedAt: NOW,
    ...overrides,
  } as Withdrawal;
}

function transaction(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: 'txn-1',
    subjectUserId: 'user-1',
    postedAt: NOW,
    createdAt: NOW,
    ...overrides,
  } as Transaction;
}

function priceQuote(
  overrides: Partial<{
    instrumentId: string;
    price: string;
    source: string;
    observedAt: Date;
    receivedAt: Date;
    isStale: boolean;
  }> = {},
) {
  return {
    instrumentId: 'inst-btc',
    price: '112503.27',
    source: 'TestProvider',
    observedAt: NOW,
    receivedAt: NOW,
    isStale: false,
    ...overrides,
  };
}

describe('realtime-events — envelope determinism (duplicate-event handling)', () => {
  it('buildBetEvent produces an identical id for two calls describing the same transition', () => {
    const a = buildBetEvent(
      bet({
        status: 'won',
        settledAt: NOW,
      }),
    );

    const b = buildBetEvent(
      bet({
        status: 'won',
        settledAt: NOW,
      }),
    );

    expect(a.id).toBe(b.id);
    expect(a.type).toBe('bet.settled');
  });

  it('buildBetEvent produces a different id for a later transition on the same bet', () => {
    const first = buildBetEvent(
      bet({
        status: 'open',
        updatedAt: NOW,
      }),
    );

    const later = buildBetEvent(
      bet({
        status: 'won',
        settledAt: new Date(NOW.getTime() + 1000),
      }),
    );

    expect(first.id).not.toBe(later.id);
    expect(first.type).toBe('bet.updated');
    expect(later.type).toBe('bet.settled');
  });

  it('buildDepositEvent/buildWithdrawalEvent are deterministic per status+timestamp and flag terminality', () => {
    const completed = buildDepositEvent(
      deposit({
        status: 'completed',
        updatedAt: NOW,
      }),
    );

    expect(
      completed.id,
    ).toBe(
      buildDepositEvent(
        deposit({
          status: 'completed',
          updatedAt: NOW,
        }),
      ).id,
    );

    expect(completed.terminal).toBe(true);

    const pending = buildDepositEvent(
      deposit({
        status: 'pending',
        updatedAt: NOW,
      }),
    );

    expect(pending.terminal).toBe(false);

    const wd = buildWithdrawalEvent(
      withdrawal({
        status: 'completed',
        updatedAt: NOW,
      }),
    );

    expect(wd.terminal).toBe(true);
  });

  it('buildWalletTransactionEvent uses the transaction row id directly — insert-once, no derivation needed', () => {
    const event = buildWalletTransactionEvent(
      transaction({
        id: 'txn-abc',
      }),
    );

    expect(event.id).toBe('txn-abc');
    expect(event.type).toBe('wallet.transaction_posted');
    expect(event.userId).toBe('user-1');
  });

  it('buildInstrumentStatusEvent is deterministic per status+timestamp', () => {
    const instrument = {
      id: 'inst-1',
      status: 'suspended',
      updatedAt: NOW,
    } as Instrument;

    const a = buildInstrumentStatusEvent(instrument);
    const b = buildInstrumentStatusEvent(instrument);

    expect(a.id).toBe(b.id);
    expect(a.payload.status).toBe('suspended');
  });

  it('buildMarketPriceEvent exposes the API-safe decimal string and explicit quote currency', () => {
    const quote = priceQuote({
      instrumentId: 'inst-btc',
      price: '112503.27',
      observedAt: NOW,
    });

    const event = buildMarketPriceEvent(quote, 'USD');

    expect(event.type).toBe('market.price');
    expect(event.entityId).toBe('inst-btc');
    expect(event.occurredAt).toBe(NOW.toISOString());

    expect(event.payload.price).toBe('112503.27');
    expect(event.payload.quoteCurrency).toBe('USD');
    expect(event.payload.tickAt).toBe(NOW.toISOString());
  });

  it('buildMarketPriceEvent produces an identical id for the same market tick', () => {
    const quoteA = priceQuote({
      instrumentId: 'inst-btc',
      price: '112503.27',
      observedAt: NOW,
    });

    const quoteB = priceQuote({
      instrumentId: 'inst-btc',
      price: '112503.27',
      observedAt: NOW,
    });

    const eventA = buildMarketPriceEvent(quoteA, 'USD');
    const eventB = buildMarketPriceEvent(quoteB, 'USD');

    expect(eventA.id).toBe(eventB.id);
  });

  it('buildMarketPriceEvent produces a different id when the market price changes', () => {
    const first = buildMarketPriceEvent(
      priceQuote({
        instrumentId: 'inst-btc',
        price: '112503.27',
        observedAt: NOW,
      }),
      'USD',
    );

    const later = buildMarketPriceEvent(
      priceQuote({
        instrumentId: 'inst-btc',
        price: '112504.27',
        observedAt: NOW,
      }),
      'USD',
    );

    expect(first.id).not.toBe(later.id);
  });

  it('buildMarketPriceEvent produces a different id for a later tick at a different timestamp', () => {
    const first = buildMarketPriceEvent(
      priceQuote({
        instrumentId: 'inst-btc',
        price: '112503.27',
        observedAt: NOW,
      }),
      'USD',
    );

    const later = buildMarketPriceEvent(
      priceQuote({
        instrumentId: 'inst-btc',
        price: '112503.27',
        observedAt: new Date(NOW.getTime() + 1000),
      }),
      'USD',
    );

    expect(first.id).not.toBe(later.id);
  });

  it('buildNotificationEvent derives its id from the source event, never inventing a new one', () => {
    const source = buildBetEvent(
      bet({
        status: 'lost',
        settledAt: NOW,
      }),
    );

    const notification = buildNotificationEvent(source);

    expect(notification.id).toBe(
      `notification:${source.id}`,
    );
    expect(notification.type).toBe('notification.new');
    expect(notification.userId).toBe(source.userId);
  });
});

describe('realtime-events — terminal-status predicates mirror the client exactly', () => {
  it('bet statuses', () => {
    expect(isSettledBetStatus('won')).toBe(true);
    expect(isSettledBetStatus('lost')).toBe(true);
    expect(isSettledBetStatus('void')).toBe(true);
    expect(isSettledBetStatus('cancelled')).toBe(true);
    expect(isSettledBetStatus('refunded')).toBe(true);

    expect(isSettledBetStatus('open')).toBe(false);
    expect(isSettledBetStatus('pending')).toBe(false);
    expect(isSettledBetStatus('requires_review')).toBe(false);
  });

  it('deposit statuses', () => {
    expect(isTerminalDepositStatus('completed')).toBe(true);
    expect(isTerminalDepositStatus('failed')).toBe(true);
    expect(isTerminalDepositStatus('cancelled')).toBe(true);
    expect(isTerminalDepositStatus('expired')).toBe(true);

    expect(isTerminalDepositStatus('pending')).toBe(false);
  });

  it('withdrawal statuses', () => {
    expect(isTerminalWithdrawalStatus('completed')).toBe(true);
    expect(isTerminalWithdrawalStatus('failed')).toBe(true);
    expect(isTerminalWithdrawalStatus('rejected')).toBe(true);
    expect(isTerminalWithdrawalStatus('reversed')).toBe(true);

    expect(
      isTerminalWithdrawalStatus('pending_review'),
    ).toBe(false);

    expect(
      isTerminalWithdrawalStatus('submitted'),
    ).toBe(false);
  });
});