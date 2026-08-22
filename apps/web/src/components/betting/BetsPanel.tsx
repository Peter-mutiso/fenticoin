'use client';

import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { isSettledBetStatus, listBets, type Instrument } from '@/lib/api-client';
import { describeApiError } from '@/lib/api-errors';
import { useAuth } from '@/lib/auth/AuthContext';
import { Notice } from '@/components/ui/Notice';
import { BetRow } from './BetRow';

/**
 * Lists the user's bets, newest first, and polls faster while any of them
 * are still open/pending/under-review — this is how settlement results
 * actually reach the screen, since settlement itself is a server-side
 * scheduler process with no push channel to the browser. Settlement
 * transitions are detected and turned into toasts/notifications by
 * `NotificationProvider` (which shares this same `['bets', 'recent']`
 * query), not here — this component only renders.
 */
export function BetsPanel({ instruments }: { instruments: Instrument[] }) {
  const { status } = useAuth();

  const betsQuery = useQuery({
    queryKey: ['bets', 'recent'],
    queryFn: () => listBets({ limit: 15 }),
    enabled: status === 'authenticated',
    refetchInterval: (query) => {
      const items = query.state.data?.items ?? [];
      const hasUnsettled = items.some((bet) => !isSettledBetStatus(bet.status));
      return hasUnsettled ? 3_000 : 15_000;
    },
  });

  const instrumentById = useMemo(() => new Map(instruments.map((instrument) => [instrument.id, instrument])), [instruments]);
  const bets = betsQuery.data?.items ?? [];

  if (status !== 'authenticated') return null;
  if (betsQuery.isLoading) return <p className="mt-6 text-sm text-neutral-500">Loading your bets…</p>;

  if (betsQuery.error) {
    return (
      <section className="mt-8" aria-labelledby="bets-heading">
        <h2 id="bets-heading" className="text-lg font-bold text-neutral-900">
          Your bets
        </h2>
        <Notice text={`Unable to load your bets. ${describeApiError(betsQuery.error).title}`} className="mt-3" />
      </section>
    );
  }

  if (bets.length === 0) return null;

  return (
    <section className="mt-8" aria-labelledby="bets-heading">
      <h2 id="bets-heading" className="text-lg font-bold text-neutral-900">
        Your bets
      </h2>
      <ul className="mt-3 space-y-2">
        {bets.map((bet) => (
          <BetRow key={bet.id} bet={bet} instrument={instrumentById.get(bet.instrumentId)} />
        ))}
      </ul>
    </section>
  );
}
