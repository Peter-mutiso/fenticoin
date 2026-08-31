
import type {
  RealtimeEvent,
  MarketPricePayload,
  MarketStatusPayload,
} from '@fenticoin/types';

import type {
  Bet,
  BetStatus,
  Deposit,
  DepositStatus,
  Instrument,
  Transaction,
  Withdrawal,
  WithdrawalStatus,
} from '../database/schema';

import type { PriceQuote } from '../markets/price-quote';

/**
 * Deterministic envelope builders — every `id` is derived from the row +
 * transition being announced (never a random UUID) so re-emitting the same
 * underlying fact twice produces an identical `id` a client can dedupe
 * against.
 *
 * `occurredAt` always comes from the underlying event/tick timestamp rather
 * than `Date.now()`, so clients can compare timestamps and detect stale or
 * out-of-order delivery.
 *
 * Financial payloads deliberately carry no balance/amount/outcome — see
 * `RealtimeEvent`'s doc comment in `@fenticoin/types`.
 */

const TERMINAL_BET_STATUSES: readonly BetStatus[] = [
  'won',
  'lost',
  'void',
  'cancelled',
  'refunded',
];

export function isSettledBetStatus(status: BetStatus): boolean {
  return TERMINAL_BET_STATUSES.includes(status);
}

const TERMINAL_DEPOSIT_STATUSES: readonly DepositStatus[] = [
  'completed',
  'failed',
  'cancelled',
  'expired',
];

export function isTerminalDepositStatus(
  status: DepositStatus,
): boolean {
  return TERMINAL_DEPOSIT_STATUSES.includes(status);
}

const TERMINAL_WITHDRAWAL_STATUSES: readonly WithdrawalStatus[] = [
  'completed',
  'failed',
  'rejected',
  'reversed',
];

export function isTerminalWithdrawalStatus(
  status: WithdrawalStatus,
): boolean {
  return TERMINAL_WITHDRAWAL_STATUSES.includes(status);
}

export function buildBetEvent(
  bet: Bet,
): RealtimeEvent {
  const isSettled = isSettledBetStatus(bet.status);

  const occurredAt = (
    isSettled
      ? (bet.settledAt ?? bet.updatedAt)
      : bet.updatedAt
  ).toISOString();

  return {
    id: `${bet.id}:${bet.status}:${occurredAt}`,
    type: isSettled
      ? 'bet.settled'
      : 'bet.updated',
    entityId: bet.id,
    userId: bet.userId,
    occurredAt,
    payload: {},
  };
}

export function buildDepositEvent(
  deposit: Deposit,
): RealtimeEvent {
  const occurredAt =
    deposit.updatedAt.toISOString();

  return {
    id: `${deposit.id}:${deposit.status}:${occurredAt}`,
    type: 'deposit.status_changed',
    entityId: deposit.id,
    userId: deposit.userId,
    occurredAt,
    payload: {},
    terminal: isTerminalDepositStatus(
      deposit.status,
    ),
  };
}

export function buildWithdrawalEvent(
  withdrawal: Withdrawal,
): RealtimeEvent {
  const occurredAt =
    withdrawal.updatedAt.toISOString();

  return {
    id: `${withdrawal.id}:${withdrawal.status}:${occurredAt}`,
    type: 'withdrawal.status_changed',
    entityId: withdrawal.id,
    userId: withdrawal.userId,
    occurredAt,
    payload: {},
    terminal: isTerminalWithdrawalStatus(
      withdrawal.status,
    ),
  };
}

export function buildWalletTransactionEvent(
  transaction: Transaction,
): RealtimeEvent {
  const occurredAt = (
    transaction.postedAt ??
    transaction.createdAt
  ).toISOString();

  return {
    id: transaction.id,
    type: 'wallet.transaction_posted',
    entityId: transaction.id,
    userId:
      transaction.subjectUserId ??
      undefined,
    occurredAt,
    payload: {},
  };
}

export function buildInstrumentStatusEvent(
  instrument: Instrument,
): RealtimeEvent<MarketStatusPayload> {
  const occurredAt =
    instrument.updatedAt.toISOString();

  return {
    id: `${instrument.id}:${instrument.status}:${occurredAt}`,
    type: 'market.status',
    entityId: instrument.id,
    occurredAt,
    payload: {
      status: instrument.status,
    },
  };
}

/**
 * Build a realtime market-price event from an API-safe PriceQuote.
 *
 * PriceQuote.price is intentionally a decimal string, not a Money object.
 * Therefore this function must never call:
 *
 *   quote.price.toMinorUnits()
 *   quote.price.currency.code
 *
 * The currency is supplied explicitly by the caller from the trusted
 * instrument configuration.
 */
export function buildMarketPriceEvent(
  quote: PriceQuote,
  quoteCurrency: string,
): RealtimeEvent<MarketPricePayload> {
  const occurredAt =
    quote.observedAt.toISOString();

  return {
    /**
     * The event ID is deterministic:
     *
     *   instrument + observed timestamp + exact decimal price
     *
     * Re-emitting the same market tick therefore produces the same ID and
     * allows clients to safely deduplicate it.
     */
    id: `${quote.instrumentId}:${occurredAt}:${quote.price}`,
    type: 'market.price',
    entityId: quote.instrumentId,
    occurredAt,
    payload: {
      price: quote.price,
      quoteCurrency,
      tickAt: occurredAt,
    },
  };
}

/**
 * Announces that a demo account's own history/wallet/bots were just wiped
 * and re-funded by `DemoService.resetDemo`.
 *
 * Unlike every other private event, there is no single database row from
 * which to derive the event ID/timestamp. The reset moment therefore forms
 * the event identity.
 */
export function buildDemoResetEvent(
  demoUserId: string,
): RealtimeEvent {
  const occurredAt =
    new Date().toISOString();

  return {
    id: `demo-reset:${demoUserId}:${occurredAt}`,
    type: 'demo.reset',
    entityId: demoUserId,
    userId: demoUserId,
    occurredAt,
    payload: {},
  };
}

export function buildNotificationEvent(
  source: RealtimeEvent,
): RealtimeEvent {
  return {
    id: `notification:${source.id}`,
    type: 'notification.new',
    entityId: source.entityId,
    userId: source.userId,
    occurredAt: source.occurredAt,
    payload: {},
  };
}
