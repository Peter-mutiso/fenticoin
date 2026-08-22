'use client';

import { useQuery } from '@tanstack/react-query';
import { BarChart3 } from 'lucide-react';
import { useState } from 'react';

import { getReportsOverview, getRevenueReport } from '@/lib/api-client';
import { describeApiError } from '@/lib/api-errors';
import { formatCurrencyMinorUnits } from '@/lib/money';
import { EmptyState } from '@/components/ui/EmptyState';
import { Notice } from '@/components/ui/Notice';

function toDateInputValue(date: Date): string {
  return date.toISOString().slice(0, 10);
}

const DEFAULT_TO = new Date();
const DEFAULT_FROM = new Date(DEFAULT_TO.getTime() - 30 * 24 * 60 * 60 * 1000);

export function RevenueReportView() {
  const [from, setFrom] = useState(toDateInputValue(DEFAULT_FROM));
  const [to, setTo] = useState(toDateInputValue(DEFAULT_TO));

  const overviewQuery = useQuery({ queryKey: ['reports', 'overview'], queryFn: getReportsOverview });
  const revenueQuery = useQuery({
    queryKey: ['reports', 'revenue', from, to],
    queryFn: () => getRevenueReport(new Date(from).toISOString(), new Date(`${to}T23:59:59.999Z`).toISOString()),
  });

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm sm:p-5">
        <h2 className="text-sm font-bold text-neutral-900">Platform snapshot</h2>
        {overviewQuery.isLoading ? (
          <div className="mt-3 h-16 animate-pulse rounded-xl bg-neutral-100" />
        ) : overviewQuery.error ? (
          <Notice text={describeApiError(overviewQuery.error).title} className="mt-3" />
        ) : (
          <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div>
              <dt className="text-xs text-neutral-500">Pending deposits</dt>
              <dd className="text-lg font-bold text-neutral-900">{overviewQuery.data!.pendingDepositsCount.toLocaleString()}</dd>
            </div>
            <div>
              <dt className="text-xs text-neutral-500">Pending withdrawals</dt>
              <dd className="text-lg font-bold text-neutral-900">{overviewQuery.data!.pendingWithdrawalsCount.toLocaleString()}</dd>
            </div>
            <div>
              <dt className="text-xs text-neutral-500">Bets requiring review</dt>
              <dd className="text-lg font-bold text-neutral-900">{overviewQuery.data!.betsRequiringReviewCount.toLocaleString()}</dd>
            </div>
            {overviewQuery.data!.usersByStatus.map((row) => (
              <div key={row.status}>
                <dt className="text-xs capitalize text-neutral-500">{row.status.replace('_', ' ')} users</dt>
                <dd className="text-lg font-bold text-neutral-900">{row.count.toLocaleString()}</dd>
              </div>
            ))}
          </dl>
        )}
      </section>

      <section className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm sm:p-5">
        <h2 className="text-sm font-bold text-neutral-900">Revenue by date range</h2>
        <p className="mt-0.5 text-xs text-neutral-500">Gross stake volume and gross gaming revenue from settled (won/lost) bets only — never an invented metric.</p>

        <div className="mt-3 flex flex-wrap items-end gap-3">
          <label className="text-xs font-semibold text-neutral-600">
            From
            <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} className="mt-1 block rounded-xl border border-neutral-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500" />
          </label>
          <label className="text-xs font-semibold text-neutral-600">
            To
            <input type="date" value={to} onChange={(event) => setTo(event.target.value)} className="mt-1 block rounded-xl border border-neutral-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500" />
          </label>
        </div>

        <div className="mt-4">
          {revenueQuery.isLoading ? (
            <div className="h-16 animate-pulse rounded-xl bg-neutral-100" />
          ) : revenueQuery.error ? (
            <Notice text={describeApiError(revenueQuery.error).title} />
          ) : revenueQuery.data && revenueQuery.data.byCurrency.length > 0 ? (
            <div className="space-y-2">
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
            <EmptyState icon={BarChart3} title="No settled bets in this range." />
          )}
        </div>
      </section>
    </div>
  );
}
