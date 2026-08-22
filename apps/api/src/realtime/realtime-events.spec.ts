import type { Bet, Deposit, Instrument, Transaction, Withdrawal } from '../database/schema';
import {
  buildBetEvent,
  buildDepositEvent,
  buildInstrumentStatusEvent,
  buildNotificationEvent,
  buildWalletTransactionEvent,
  buildWithdrawalEvent,
  isSettledBetStatus,
  isTerminalDepositStatus,
  isTerminalWithdrawalStatus,
} from './realtime-events';

const NOW = new Date('2026-01-01T00:00:00.000Z');

function bet(overrides: Partial<Bet> = {}): Bet {
  return { id: 'bet-1', userId: 'user-1', status: 'open', updatedAt: NOW, settledAt: null, ...overrides } as Bet;
}

function deposit(overrides: Partial<Deposit> = {}): Deposit {
  return { id: 'dep-1', userId: 'user-1', status: 'pending', updatedAt: NOW, ...overrides } as Deposit;
}

function withdrawal(overrides: Partial<Withdrawal> = {}): Withdrawal {
  return { id: 'wd-1', userId: 'user-1', status: 'pending_review', updatedAt: NOW, ...overrides } as Withdrawal;
}

function transaction(overrides: Partial<Transaction> = {}): Transaction {
  return { id: 'txn-1', subjectUserId: 'user-1', postedAt: NOW, createdAt: NOW, ...overrides } as Transaction;
}

describe('realtime-events — envelope determinism (duplicate-event handling)', () => {
  it('buildBetEvent produces an identical id for two calls describing the same transition', () => {
    const a = buildBetEvent(bet({ status: 'won', settledAt: NOW }));
    const b = buildBetEvent(bet({ status: 'won', settledAt: NOW }));
    expect(a.id).toBe(b.id);
    expect(a.type).toBe('bet.settled');
  });

  it('buildBetEvent produces a different id for a later transition on the same bet', () => {
    const first = buildBetEvent(bet({ status: 'open', updatedAt: NOW }));
    const later = buildBetEvent(bet({ status: 'won', settledAt: new Date(NOW.getTime() + 1000) }));
    expect(first.id).not.toBe(later.id);
    expect(first.type).toBe('bet.updated');
    expect(later.type).toBe('bet.settled');
  });

  it('buildDepositEvent/buildWithdrawalEvent are deterministic per status+timestamp and flag terminality', () => {
    const completed = buildDepositEvent(deposit({ status: 'completed', updatedAt: NOW }));
    expect(completed.id).toBe(buildDepositEvent(deposit({ status: 'completed', updatedAt: NOW })).id);
    expect(completed.terminal).toBe(true);

    const pending = buildDepositEvent(deposit({ status: 'pending', updatedAt: NOW }));
    expect(pending.terminal).toBe(false);

    const wd = buildWithdrawalEvent(withdrawal({ status: 'completed', updatedAt: NOW }));
    expect(wd.terminal).toBe(true);
  });

  it('buildWalletTransactionEvent uses the transaction row id directly — insert-once, no derivation needed', () => {
    const event = buildWalletTransactionEvent(transaction({ id: 'txn-abc' }));
    expect(event.id).toBe('txn-abc');
    expect(event.type).toBe('wallet.transaction_posted');
    expect(event.userId).toBe('user-1');
  });

  it('buildInstrumentStatusEvent is deterministic per status+timestamp', () => {
    const instrument = { id: 'inst-1', status: 'suspended', updatedAt: NOW } as Instrument;
    const a = buildInstrumentStatusEvent(instrument);
    const b = buildInstrumentStatusEvent(instrument);
    expect(a.id).toBe(b.id);
    expect(a.payload.status).toBe('suspended');
  });

  it('buildNotificationEvent derives its id from the source event, never inventing a new one', () => {
    const source = buildBetEvent(bet({ status: 'lost', settledAt: NOW }));
    const notification = buildNotificationEvent(source);
    expect(notification.id).toBe(`notification:${source.id}`);
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
    expect(isTerminalWithdrawalStatus('pending_review')).toBe(false);
    expect(isTerminalWithdrawalStatus('submitted')).toBe(false);
  });
});
