'use client';

import type { RealtimeEvent, RealtimeEventType } from '@fenticoin/types';
import { useQueryClient, type QueryKey } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';

import { ensureFreshSession } from '@/lib/api-client';
import { useAuth } from '@/lib/auth/AuthContext';
import { getStoredAccessToken } from '@/lib/auth/token-storage';
import { getPublicEnv } from '@/lib/env';

interface RealtimeContextValue {
  connected: boolean;
  subscribeInstrument: (instrumentId: string) => void;
  unsubscribeInstrument: (instrumentId: string) => void;
}

const RealtimeContext = createContext<RealtimeContextValue>({
  connected: false,
  subscribeInstrument: () => {},
  unsubscribeInstrument: () => {},
});

/** Run on every connect/reconnect (including the very first connect) — full reconciliation against the server, since the DB is the source of truth and a socket gap of any length is trivially covered by a refetch. */
const RECONNECT_INVALIDATION_KEYS: QueryKey[] = [
  ['wallet'],
  ['bets', 'recent'],
  ['bets', 'portfolio'],
  ['deposits', 'recent'],
  ['withdrawals', 'recent'],
  ['instruments'],
  ['instrument'],
  ['price'],
];

/**
 * Targeted invalidation per event type, applied only while already
 * connected — this is what makes updates feel faster than the 3-15s poll
 * baseline. Every event type maps to a REST refetch, never to writing the
 * event's own payload into the cache directly: financial event types
 * carry no balance/amount/outcome at all (see `RealtimeEvent`'s doc
 * comment in `@fenticoin/types`), and `market.price`'s payload shape is
 * deliberately smaller than the REST `PriceQuote` type (no
 * `priceMinorUnits`/`isStale`/etc.) — splicing a partial shape into the
 * cache would risk a subtly inconsistent object, whereas invalidating and
 * letting the existing `getPrice` fetcher run is simple and always
 * correct.
 */
function invalidationKeysFor(event: RealtimeEvent): QueryKey[] {
  switch (event.type) {
    case 'bet.updated':
      return [['bets', 'recent'], ['bets', 'portfolio'], ['bet', event.entityId]];
    case 'bet.settled':
      return [['bets', 'recent'], ['bets', 'portfolio'], ['bet', event.entityId], ['wallet']];
    case 'deposit.status_changed':
      return event.terminal ? [['deposits', 'recent'], ['wallet']] : [['deposits', 'recent']];
    case 'withdrawal.status_changed':
      return event.terminal ? [['withdrawals', 'recent'], ['wallet']] : [['withdrawals', 'recent']];
    case 'wallet.transaction_posted':
      return [['wallet'], ['wallet-transactions']];
    case 'market.status':
      return [['instruments'], ['instrument', event.entityId]];
    case 'market.price':
      return [['price', event.entityId]];
    case 'notification.new':
      // No query of its own — its only job is making the underlying
      // bet/deposit/withdrawal invalidation above happen sooner, which
      // already covers it.
      return [];
    default:
      return [];
  }
}

const SUBSCRIBABLE_EVENT_TYPES: RealtimeEventType[] = [
  'bet.updated',
  'bet.settled',
  'deposit.status_changed',
  'withdrawal.status_changed',
  'wallet.transaction_posted',
  'notification.new',
  'market.status',
  'market.price',
];

const SEEN_EVENT_CAP = 500;

/**
 * Dedup + ordering guard, shared by every event type: an event whose id
 * was already processed, or whose `occurredAt` is no newer than the
 * last-applied one for its entity, is dropped before any invalidation
 * runs. Stale and out-of-order delivery reduce to the same check — both
 * mean "this event does not describe the newest known state" — so one
 * guard covers both.
 */
class EventGuard {
  private readonly seenIds: string[] = [];
  private readonly seenIdSet = new Set<string>();
  private readonly lastOccurredAt = new Map<string, string>();

  shouldApply(event: RealtimeEvent): boolean {
    if (this.seenIdSet.has(event.id)) return false;

    const entityKey = `${event.type}:${event.entityId}`;
    const lastForEntity = this.lastOccurredAt.get(entityKey);
    if (lastForEntity && event.occurredAt <= lastForEntity) return false;

    this.seenIdSet.add(event.id);
    this.seenIds.push(event.id);
    if (this.seenIds.length > SEEN_EVENT_CAP) {
      const oldest = this.seenIds.shift();
      if (oldest) this.seenIdSet.delete(oldest);
    }
    this.lastOccurredAt.set(entityKey, event.occurredAt);
    return true;
  }

  reset(): void {
    this.seenIds.length = 0;
    this.seenIdSet.clear();
    this.lastOccurredAt.clear();
  }
}

/**
 * Connects to the end-user WebSocket namespace and turns incoming events
 * into react-query cache invalidations — never into displayed financial
 * state directly. Existing `refetchInterval` polling throughout the app is
 * left completely untouched: if this socket never connects or drops for an
 * extended period, the UI is only ever as stale as it already was before
 * this provider existed, never worse.
 */
export function RealtimeProvider({ children }: { children: React.ReactNode }) {
  const { status } = useAuth();
  const queryClient = useQueryClient();
  const [connected, setConnected] = useState(false);
  const guardRef = useRef(new EventGuard());
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (status !== 'authenticated') {
      socketRef.current?.disconnect();
      socketRef.current = null;
      setConnected(false);
      return;
    }

    const { NEXT_PUBLIC_API_URL } = getPublicEnv();
    const socket = io(NEXT_PUBLIC_API_URL, {
      auth: (cb) => cb({ token: getStoredAccessToken() }),
      reconnection: true,
      transports: ['websocket', 'polling'],
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      setConnected(true);
      guardRef.current.reset();
      for (const key of RECONNECT_INVALIDATION_KEYS) {
        void queryClient.invalidateQueries({ queryKey: key, exact: false });
      }
    });

    socket.on('disconnect', () => setConnected(false));

    // A socket dropped specifically due to an expired token would
    // otherwise keep retrying with the same stale token forever if the
    // user is idle (no REST call around to trigger the normal 401-retry
    // refresh). Proactively refresh once so the next reconnect attempt
    // picks up a valid token via the `auth` callback above.
    socket.on('connect_error', () => {
      void ensureFreshSession();
    });

    const handler = (event: RealtimeEvent) => {
      if (!guardRef.current.shouldApply(event)) return;
      for (const key of invalidationKeysFor(event)) {
        void queryClient.invalidateQueries({ queryKey: key, exact: false });
      }
    };
    for (const type of SUBSCRIBABLE_EVENT_TYPES) socket.on(type, handler);

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [status, queryClient]);

  const subscribeInstrument = useCallback((instrumentId: string) => {
    socketRef.current?.emit('subscribe:instrument', { instrumentId });
  }, []);
  const unsubscribeInstrument = useCallback((instrumentId: string) => {
    socketRef.current?.emit('unsubscribe:instrument', { instrumentId });
  }, []);

  const value = useMemo<RealtimeContextValue>(
    () => ({ connected, subscribeInstrument, unsubscribeInstrument }),
    [connected, subscribeInstrument, unsubscribeInstrument],
  );

  return <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>;
}

export function useRealtime(): RealtimeContextValue {
  return useContext(RealtimeContext);
}

/** Joins an instrument's public price/status room while mounted — a `market.price`/`market.status` event then invalidates `['price', instrumentId]`/`['instruments']`, making the existing 5s poll refetch sooner rather than replacing it. */
export function useInstrumentRealtimeSubscription(instrumentId: string | undefined): void {
  const { subscribeInstrument, unsubscribeInstrument, connected } = useRealtime();

  useEffect(() => {
    if (!instrumentId || !connected) return;
    subscribeInstrument(instrumentId);
    return () => unsubscribeInstrument(instrumentId);
  }, [instrumentId, connected, subscribeInstrument, unsubscribeInstrument]);
}
