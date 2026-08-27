'use client';

import { useQuery } from '@tanstack/react-query';
import { Bot as BotIcon, Clock } from 'lucide-react';
import Link from 'next/link';

import { formatExecutionInterval, listBets, listBots, listInstruments } from '@/lib/api-client';
import { describeApiError } from '@/lib/api-errors';
import { useAuth } from '@/lib/auth/AuthContext';
import { useWalletBalance } from '@/hooks/useWalletBalance';
import { BetRow } from '@/components/betting/BetRow';
import { OpenPositions } from '@/components/betting/OpenPositions';
import { BOT_STATUS_STYLES } from '@/components/bots/BotDetail';
import { EmptyState } from '@/components/ui/EmptyState';
import { Notice } from '@/components/ui/Notice';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { BalanceCard } from '@/components/wallet/BalanceCard';
import { FeaturedInstruments } from './FeaturedInstruments';

const RECENT_ACTIVITY_PREVIEW_COUNT = 3;
const BOTS_PREVIEW_COUNT = 3;

/**
 * The authenticated home — a true at-a-glance summary (balance, open
 * positions, active bots, recent activity), each linking through to its
 * own full page, rather than embedding the entire trade builder here.
 * `/trade` remains the dedicated place to actually place a bet. Every
 * number here comes straight from the same server-authoritative queries
 * the rest of the app uses (`listBets`/`listBots`/wallet) — nothing is
 * computed or fabricated client-side.
 */
export function HomeDashboard() {
  const { status: authStatus, isDemo } = useAuth();
  const enabled = authStatus === 'authenticated';
  const balance = useWalletBalance();

  const betsQuery = useQuery({ queryKey: ['bets', 'dashboard'], queryFn: () => listBets({ limit: 20 }), enabled });
  const botsQuery = useQuery({ queryKey: ['bots'], queryFn: listBots, enabled });
  const instrumentsQuery = useQuery({ queryKey: ['instruments'], queryFn: () => listInstruments(), enabled });

  if (authStatus !== 'authenticated') {
    return (
      <div className="space-y-6 pb-8 max-w-xl mx-auto">
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-brand-500/30 bg-brand-50 p-4">
          <p className="text-sm font-semibold text-brand-700">Log in to see your balance and account activity.</p>
          <Link href="/login" className="shrink-0 rounded-full bg-brand-500 px-4 py-2 text-sm font-bold text-white transition hover:bg-brand-600">
            Log in
          </Link>
        </div>
        <FeaturedInstruments />
      </div>
    );
  }

  const instrumentById = new Map((instrumentsQuery.data?.items ?? []).map((instrument) => [instrument.id, instrument]));
  const bets = betsQuery.data?.items ?? [];
  const recentBets = [...bets]
    .sort((a, b) => new Date(b.placedAt).getTime() - new Date(a.placedAt).getTime())
    .slice(0, RECENT_ACTIVITY_PREVIEW_COUNT);
  const bots = botsQuery.data?.items ?? [];
  const previewBots = bots.slice(0, BOTS_PREVIEW_COUNT);

  return (
    <div className="space-y-6 pb-8 max-w-xl mx-auto">
      <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>

      {balance.data ? (
        <BalanceCard
          availableMinorUnits={balance.data.availableMinorUnits}
          lockedMinorUnits={balance.data.lockedMinorUnits}
          currency={balance.data.currency}
          showLocked
          isDemo={isDemo}
        />
      ) : balance.error ? (
        <Notice text={describeApiError(balance.error).title} />
      ) : (
        <div className="h-28 animate-pulse rounded-3xl bg-neutral-100" />
      )}

      {betsQuery.isLoading ? (
        <div className="h-20 animate-pulse rounded-2xl bg-neutral-100" />
      ) : betsQuery.error ? (
        <Notice text={describeApiError(betsQuery.error).title} />
      ) : (
        <OpenPositions
          bets={bets}
          instruments={instrumentsQuery.data?.items ?? []}
          emptyHint="Place a trade to see it here while it's active."
        />
      )}

      <section aria-labelledby="dashboard-bots-heading">
        <div className="flex items-center justify-between">
          <h2 id="dashboard-bots-heading" className="text-lg font-bold text-neutral-900">
            Bots
          </h2>
          <Link href="/bots" className="text-sm font-semibold text-brand-600 hover:underline">
            View all &gt;
          </Link>
        </div>
        <div className="mt-3">
          {botsQuery.isLoading ? (
            <div className="h-16 animate-pulse rounded-2xl bg-neutral-100" />
          ) : botsQuery.error ? (
            <Notice text={describeApiError(botsQuery.error).title} />
          ) : previewBots.length === 0 ? (
            <EmptyState
              icon={BotIcon}
              title="No bots yet"
              description="Automate a strategy, or start from a recommended preset."
              action={{ label: 'Create a bot', href: '/bots/new' }}
            />
          ) : (
            <ul className="space-y-2">
              {previewBots.map((bot) => (
                <li key={bot.id}>
                  <Link
                    href={`/bots/${bot.id}`}
                    className="flex items-center justify-between gap-3 rounded-2xl border border-neutral-200 bg-white p-4 transition hover:border-neutral-300"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-neutral-900">{bot.name}</p>
                      <p className="mt-0.5 text-xs text-neutral-500">Every {formatExecutionInterval(bot.executionIntervalSeconds)}</p>
                    </div>
                    <StatusBadge status={bot.status} styles={BOT_STATUS_STYLES} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section aria-labelledby="dashboard-activity-heading">
        <div className="flex items-center justify-between">
          <h2 id="dashboard-activity-heading" className="text-lg font-bold text-neutral-900">
            Recent activity
          </h2>
          <Link href="/bet-history" className="text-sm font-semibold text-brand-600 hover:underline">
            View all &gt;
          </Link>
        </div>
        <div className="mt-3">
          {betsQuery.isLoading ? (
            <div className="h-16 animate-pulse rounded-2xl bg-neutral-100" />
          ) : recentBets.length === 0 ? (
            <EmptyState icon={Clock} title="No activity yet" description="Trades you place will show up here." />
          ) : (
            <ul className="space-y-2">
              {recentBets.map((bet) => (
                <BetRow key={bet.id} bet={bet} instrument={instrumentById.get(bet.instrumentId)} />
              ))}
            </ul>
          )}
        </div>
      </section>

      <FeaturedInstruments />

      <div className="flex justify-center pt-2">
        <Link
          href="/trade"
          className="inline-flex items-center justify-center rounded-full bg-brand-500 px-6 py-3 text-sm font-bold text-white transition hover:bg-brand-600"
        >
          Start a trade
        </Link>
      </div>
    </div>
  );
}
