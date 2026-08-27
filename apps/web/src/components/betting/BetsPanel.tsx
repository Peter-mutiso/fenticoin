'use client';

import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { isSettledBetStatus, listBets, type Instrument } from '@/lib/api-client';
import { describeApiError } from '@/lib/api-errors';
import { useAuth } from '@/lib/auth/AuthContext';
import { Notice } from '@/components/ui/Notice';
import { BetRow } from './BetRow';
import { OpenPositions } from './OpenPositions';

/**
 * Lists the user's bets — open positions prominently, settled history
 * below — newest first, and polls faster while any of them are still
 * open/pending/under-review. This is how settlement results actually
 * reach the screen: the moment a bet's status flips server-side, the next
 * poll moves it out of `OpenPositions` and into history below, with a
 * WIN/LOSS badge and (via `useWalletBalance`'s own poll elsewhere on the
 * page) an updated balance — never a client-computed outcome.
 * Settlement transitions are turned into toasts by `NotificationProvider`
 * (which shares this same `['bets', 'recent']` query), not here — this
 * component only renders.
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
  const settled = bets.filter((bet) => isSettledBetStatus(bet.status));

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
    <div className="mt-8 space-y-8">
      <OpenPositions bets={bets} instruments={instruments} emptyHint="Trades you place will appear here until they settle." />

      {settled.length > 0 && (
        <section aria-labelledby="bets-history-heading">
          <h2 id="bets-history-heading" className="text-lg font-bold text-neutral-900">
            Recent history
          </h2>
          <ul className="mt-3 space-y-2">
            {settled.map((bet) => (
              <BetRow key={bet.id} bet={bet} instrument={instrumentById.get(bet.instrumentId)} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
