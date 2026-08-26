/**
 * Shared contract for the real-time (WebSocket) layer, consumed by the
 * backend gateways (emission) and both frontends (dedup/ordering + cache
 * invalidation). Financial event payloads deliberately carry no balance,
 * amount, or outcome data — see `RealtimeEvent`'s doc comment — so a
 * handler can only ever treat an event as "go refetch," never as proof of
 * financial state.
 */
export type RealtimeEventType =
  | 'wallet.transaction_posted'
  | 'bet.updated'
  | 'bet.settled'
  | 'deposit.status_changed'
  | 'withdrawal.status_changed'
  | 'market.price'
  | 'market.status'
  | 'notification.new'
  | 'demo.reset';

/**
 * `id` is a deterministic idempotency key derived from the underlying row
 * + transition (never a random UUID), so re-emitting the same fact twice
 * produces an identical `id` a client can dedupe against. `occurredAt` is
 * always sourced from the authoritative DB column for the transition
 * being announced, not `Date.now()` at emit time, so it can be compared
 * across events to detect stale/out-of-order delivery.
 *
 * Financial categories (`wallet.transaction_posted`, `bet.updated`,
 * `bet.settled`, `deposit.status_changed`, `withdrawal.status_changed`)
 * carry only this envelope shape — `payload` is `Record<string, never>`
 * for those types. Only `market.price`/`market.status` carry real data in
 * `payload`, since market data isn't account state and low-latency price
 * display is the point of that stream.
 */
export interface RealtimeEvent<TPayload = Record<string, never>> {
  id: string;
  type: RealtimeEventType;
  entityId: string;
  /** Present on private-room (per-user) events; absent on market events. */
  userId?: string;
  occurredAt: string;
  payload: TPayload;
  /** Set on `deposit.status_changed`/`withdrawal.status_changed` only — whether this transition is terminal (drives notification projection). Not present on other event types. */
  terminal?: boolean;
}

export interface MarketPricePayload {
  price: string;
  quoteCurrency: string;
  tickAt: string;
}

export interface MarketStatusPayload {
  status: string;
}

export type RealtimeMarketPriceEvent = RealtimeEvent<MarketPricePayload>;
export type RealtimeMarketStatusEvent = RealtimeEvent<MarketStatusPayload>;

/** Room-naming helpers, shared so the server and both clients never drift on the convention. */
export function userRoom(userId: string): string {
  return `user:${userId}`;
}

export function instrumentRoom(instrumentId: string): string {
  return `instrument:${instrumentId}`;
}

export const ADMIN_TOPICS = ['withdrawals', 'deposits', 'bets-review', 'reports'] as const;
export type AdminTopic = (typeof ADMIN_TOPICS)[number];

export function adminTopicRoom(topic: AdminTopic): string {
  return `admin:${topic}`;
}
