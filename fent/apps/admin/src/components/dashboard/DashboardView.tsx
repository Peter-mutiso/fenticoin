'use client';

import { useQuery } from '@tanstack/react-query';
import { AlertOctagon, Coins, Landmark, Users } from 'lucide-react';

import { getReportsOverview, getRevenueReport } from '@/lib/api-client';
import { describeApiError } from '@/lib/api-errors';
import { formatCurrencyMinorUnits } from '@/lib/money';
import { Notice } from '@/components/ui/Notice';
import { StatCard } from './StatCard';

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export function DashboardView() {
  // 30s polling fallback alongside the real-time layer's push invalidation
  // — apps/admin has no other polling, so this is what keeps the overview
  // current if the socket is ever unavailable.
  const overviewQuery = useQuery({ queryKey: ['reports', 'overview'], queryFn: getReportsOverview, refetchInterval: 30_000 });

  const to = new Date();
  const from = new Date(to.getTime() - THIRTY_DAYS_MS);
  const revenueQuery = useQuery({
    queryKey: ['reports', 'revenue', '30d'],
    queryFn: () => getRevenueReport(from.toISOString(), to.toISOString()),
  });

  if (overviewQuery.isLoading) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-24 animate-pulse rounded-2xl bg-neutral-100" />
        ))}
      </div>
    );
  }

  if (overviewQuery.error) {
    return <Notice text={describeApiError(overviewQuery.error).title} />;
  }

  const overview = overviewQuery.data;
  if (!overview) return null;

  const activeUsers = overview.usersByStatus.find((row) => row.status === 'active')?.count ?? 0;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard icon={Users} label="Active users" value={activeUsers.toLocaleString()} />
        <StatCard icon={Landmark} label="Pending deposits" value={overview.pendingDepositsCount.toLocaleString()} tone={overview.pendingDepositsCount > 0 ? 'brand' : 'neutral'} />
        <StatCard icon={Coins} label="Pending withdrawals" value={overview.pendingWithdrawalsCount.toLocaleString()} tone={overview.pendingWithdrawalsCount > 0 ? 'brand' : 'neutral'} />
        <StatCard icon={AlertOctagon} label="Bets requiring review" value={overview.betsRequiringReviewCount.toLocaleString()} tone={overview.betsRequiringReviewCount > 0 ? 'loss' : 'neutral'} />
      </div>

      <section className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm sm:p-5">
        <h2 className="text-sm font-bold text-neutral-900">Users by status</h2>
        <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {overview.usersByStatus.map((row) => (
            <div key={row.status}>
              <dt className="text-xs capitalize text-neutral-500">{row.status.replace('_', ' ')}</dt>
              <dd className="text-lg font-bold text-neutral-900">{row.count.toLocaleString()}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm sm:p-5">
        <h2 className="text-sm font-bold text-neutral-900">Revenue — last 30 days</h2>
        <p className="mt-0.5 text-xs text-neutral-500">Gross stake volume and gross gaming revenue from settled (won/lost) bets only.</p>

        {revenueQuery.isLoading ? (
          <div className="mt-3 h-16 animate-pulse rounded-xl bg-neutral-100" />
        ) : revenueQuery.error ? (
          <Notice text={describeApiError(revenueQuery.error).title} className="mt-3" />
        ) : revenueQuery.data && revenueQuery.data.byCurrency.length > 0 ? (
          <div className="mt-3 space-y-2">
            {revenueQuery.data.byCurrency.map((row) => (
              <div key={row.currency} className="flex items-center justify-between rounded-xl bg-neutral-50 p-3">
                <div>
                  <p className="text-sm font-semibold text-neutral-900">{row.currency}</p>
                  <p className="text-xs text-neutral-500">{row.settledBetCount.toLocaleString()} settled bets</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-neutral-900">{formatCurrencyMinorUnits(row.grossStakeVolume, row.currency)} volume</p>
                  <p className="text-xs font-semibold text-brand-600">{formatCurrencyMinorUnits(row.grossGamingRevenue, row.currency)} GGR</p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-sm text-neutral-500">No settled bets in the last 30 days.</p>
        )}
      </section>
    </div>
  );
}
