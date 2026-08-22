'use client';

import type { AdminTopic, RealtimeEvent } from '@fenticoin/types';
import { useQueryClient, type QueryKey } from '@tanstack/react-query';
import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';

import { ensureFreshSession } from '@/lib/api-client';
import { useAuth } from '@/lib/auth/AuthContext';
import { getStoredAccessToken } from '@/lib/auth/token-storage';
import { getPublicEnv } from '@/lib/env';

interface RealtimeContextValue {
  connected: boolean;
}

const RealtimeContext = createContext<RealtimeContextValue>({ connected: false });

/**
 * Mirrors the server's `ADMIN_TOPIC_PERMISSIONS` map
 * (`apps/api/src/realtime/admin-realtime.gateway.ts`) exactly — the client
 * only ever *requests* a topic it believes it has access to; the server
 * independently re-checks the same permission on every
 * `subscribe:admin-topic` regardless of what this map decided.
 */
const TOPIC_PERMISSIONS: Record<AdminTopic, string> = {
  withdrawals: 'withdrawals.view',
  deposits: 'deposits.view',
  'bets-review': 'bets.view',
  reports: 'reports.view',
};

/** Every connect/reconnect reconciles the four highest-value admin views against the server, regardless of which specific events were missed. */
const RECONNECT_INVALIDATION_KEYS: QueryKey[] = [['bets-requiring-review'], ['admin-withdrawals'], ['admin-deposits'], ['reports', 'overview']];

function invalidationKeysFor(event: RealtimeEvent): QueryKey[] {
  switch (event.type) {
    case 'deposit.status_changed':
      return [['admin-deposits'], ['reports', 'overview']];
    case 'withdrawal.status_changed':
      return [['admin-withdrawals'], ['reports', 'overview']];
    case 'bet.updated':
    case 'bet.settled':
      return [['bets-requiring-review'], ['admin-bets'], ['reports', 'overview']];
    default:
      return [];
  }
}

const SEEN_EVENT_CAP = 500;

/** Same dedup + ordering guard as apps/web's RealtimeProvider — see that file for the reasoning. */
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
 * Connects to the `/admin` WebSocket namespace and turns incoming events
 * into react-query cache invalidations for the four highest-value admin
 * views — `RiskQueue`, the withdrawals/deposits lists, and the dashboard
 * overview. Unlike apps/web, apps/admin has no existing `refetchInterval`
 * polling anywhere (confirmed during planning), so this is the first
 * live-update mechanism admin gets at all; the matching polling fallback
 * for these same four views is added directly in their own components,
 * not here, so "real-time-with-fallback" holds even if this socket never
 * connects.
 */
export function RealtimeProvider({ children }: { children: React.ReactNode }) {
  const { status, permissions } = useAuth();
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
    const socket = io(`${NEXT_PUBLIC_API_URL}/admin`, {
      auth: (cb) => cb({ token: getStoredAccessToken() }),
      reconnection: true,
      transports: ['websocket', 'polling'],
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      setConnected(true);
      guardRef.current.reset();
      for (const [topic, permission] of Object.entries(TOPIC_PERMISSIONS) as [AdminTopic, string][]) {
        if (permissions.includes(permission)) socket.emit('subscribe:admin-topic', { topic });
      }
      for (const key of RECONNECT_INVALIDATION_KEYS) {
        void queryClient.invalidateQueries({ queryKey: key, exact: false });
      }
    });

    socket.on('disconnect', () => setConnected(false));
    socket.on('connect_error', () => {
      void ensureFreshSession();
    });

    const handler = (event: RealtimeEvent) => {
      if (!guardRef.current.shouldApply(event)) return;
      for (const key of invalidationKeysFor(event)) {
        void queryClient.invalidateQueries({ queryKey: key, exact: false });
      }
    };
    for (const type of ['deposit.status_changed', 'withdrawal.status_changed', 'bet.updated', 'bet.settled'] as const) {
      socket.on(type, handler);
    }

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
    // `permissions` is populated in the same state batch as `status`
    // flipping to 'authenticated' (see AuthContext.tsx), so it's already
    // current on the render where this effect (re)connects.
  }, [status, queryClient, permissions]);

  const value = useMemo<RealtimeContextValue>(() => ({ connected }), [connected]);

  return <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>;
}

export function useRealtime(): RealtimeContextValue {
  return useContext(RealtimeContext);
}
