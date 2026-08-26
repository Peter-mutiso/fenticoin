'use client';

import { useQuery } from '@tanstack/react-query';
import { Briefcase } from 'lucide-react';
import Link from 'next/link';
import { useMemo } from 'react';

import { getWallet, isSettledBetStatus, listBets, listInstruments } from '@/lib/api-client';
import { describeApiError } from '@/lib/api-errors';
import { useAuth } from '@/lib/auth/AuthContext';
import { BetRow } from '@/components/betting/BetRow';
import { EmptyState } from '@/components/ui/EmptyState';
import { Notice } from '@/components/ui/Notice';
import { BalanceCard } from '@/components/wallet/BalanceCard';
import { PerformanceSummary } from './PerformanceSummary';

export function PortfolioView() {
  const { status: authStatus, isDemo } = useAuth();
  const enabled = authStatus === 'authenticated';

  const walletQuery = useQuery({ queryKey: ['wallet', 'USD'], queryFn: () => getWallet('USD'), enabled });
  const betsQuery = useQuery({ queryKey: ['bets', 'portfolio'], queryFn: () => listBets({ limit: 50 }), enabled });
  const instrumentsQuery = useQuery({ queryKey: ['instruments'], queryFn: () => listInstruments(), enabled });

  const instrumentById = useMemo(
    () => new Map((instrumentsQuery.data?.items ?? []).map((instrument) => [instrument.id, instrument])),
    [instrumentsQuery.data],
  );

  const bets = betsQuery.data?.items ?? [];
  const openBets = bets.filter((bet) => !isSettledBetStatus(bet.status));
  const completedBets = bets.filter((bet) => isSettledBetStatus(bet.status));

  if (authStatus === 'unauthenticated') {
    return (
      <div className="flex items-center justify-between gap-3 rounded-2xl border border-brand-500/30 bg-brand-50 p-4">
        <p className="text-sm font-semibold text-brand-700">Log in to see your portfolio.</p>
        <Link href="/login" className="shrink-0 rounded-full bg-brand-500 px-4 py-2 text-sm font-bold text-white transition hover:bg-brand-600">
          Log in
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {walletQuery.data ? (
        <BalanceCard
          availableMinorUnits={walletQuery.data.availableMinorUnits}
          lockedMinorUnits={walletQuery.data.lockedMinorUnits}
          currency={walletQuery.data.currency}
          showLocked
          isDemo={isDemo}
        />
      ) : walletQuery.error ? (
        <Notice text={describeApiError(walletQuery.error).title} />
      ) : (
        <div className="h-28 animate-pulse rounded-2xl bg-neutral-100" />
      )}

      {completedBets.length > 0 && <PerformanceSummary settledBets={completedBets} currency={walletQuery.data?.currency ?? 'USD'} />}

      <section aria-labelledby="open-positions-heading">
        <h2 id="open-positions-heading" className="text-lg font-bold text-neutral-900">
          Open positions
        </h2>
        <div className="mt-3">
          {betsQuery.isLoading ? (
            <div className="h-16 animate-pulse rounded-2xl bg-neutral-100" />
          ) : betsQuery.error ? (
            <Notice text={describeApiError(betsQuery.error).title} />
          ) : openBets.length === 0 ? (
            <EmptyState 
              icon={Briefcase} 
              title="You don't have any open positions." 
              action={{ label: 'Place a bet', href: '/trade' }} 
            />
          ) : (
            <ul className="space-y-2">
              {openBets.map((bet) => (
                <BetRow key={bet.id} bet={bet} instrument={instrumentById.get(bet.instrumentId)} />
              ))}
            </ul>
          )}
        </div>
      </section>

      <section aria-labelledby="completed-bets-heading">
        <h2 id="completed-bets-heading" className="text-lg font-bold text-neutral-900">
          Completed bets
        </h2>
        <div className="mt-3">
          {betsQuery.isLoading ? null : completedBets.length === 0 ? (
            <EmptyState icon={Briefcase} title="No completed bets yet." />
          ) : (
            <ul className="space-y-2">
              {completedBets.map((bet) => (
                <BetRow key={bet.id} bet={bet} instrument={instrumentById.get(bet.instrumentId)} />
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}