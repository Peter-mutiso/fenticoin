'use client';

import { useQuery } from '@tanstack/react-query';
import { Activity } from 'lucide-react';
import { useState } from 'react';

import { listAdminBets, type BetStatus } from '@/lib/api-client';
import { describeApiError } from '@/lib/api-errors';
import { formatCurrencyMinorUnits } from '@/lib/money';
import { EmptyState } from '@/components/ui/EmptyState';
import { FilterBar } from '@/components/ui/FilterBar';
import { Notice } from '@/components/ui/Notice';
import { Pagination } from '@/components/ui/Pagination';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { BET_STATUS_STYLES } from '@/components/finance/finance-display';

const STATUS_OPTIONS: { value: BetStatus; label: string }[] = [
  { value: 'open', label: 'Active' },
  { value: 'won', label: 'Won' },
  { value: 'lost', label: 'Lost' },
  { value: 'void', label: 'Void' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'disputed', label: 'Disputed' },
  { value: 'requires_review', label: 'Under review' },
];

const PAGE_SIZE = 25;

export function UserBetsTab({ userId }: { userId: string }) {
  const [status, setStatus] = useState<BetStatus | null>(null);
  const [offset, setOffset] = useState(0);

  const query = useQuery({
    queryKey: ['admin-bets', userId, status, offset],
    queryFn: () => listAdminBets({ userId, status: status ?? undefined, limit: PAGE_SIZE, offset }),
  });

  const items = query.data?.items ?? [];

  return (
    <div>
      <FilterBar
        options={STATUS_OPTIONS}
        value={status}
        onChange={(value) => {
          setStatus(value as BetStatus | null);
          setOffset(0);
        }}
      />

      <div className="mt-4">
        {query.isLoading ? (
          <div className="space-y-2">
            {[0, 1].map((i) => (
              <div key={i} className="h-16 animate-pulse rounded-2xl bg-neutral-100" />
            ))}
          </div>
        ) : query.error ? (
          <Notice text={describeApiError(query.error).title} />
        ) : items.length === 0 ? (
          <EmptyState icon={Activity} title={status ? 'No bets match this filter.' : 'No bets yet.'} />
        ) : (
          <ul className="space-y-2">
            {items.map((bet) => (
              <li key={bet.id} className="flex items-center justify-between gap-3 rounded-2xl border border-neutral-200 bg-white p-3 sm:p-4">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-neutral-900">
                    {bet.type.replace('_', '/')} · {bet.selection}
                  </p>
                  <p className="mt-0.5 text-xs text-neutral-500">
                    Stake {formatCurrencyMinorUnits(bet.stakeAmountMinorUnits, bet.currency)} · {new Date(bet.placedAt).toLocaleString()}
                  </p>
                </div>
                <StatusBadge status={bet.status} styles={BET_STATUS_STYLES} />
              </li>
            ))}
          </ul>
        )}
      </div>

      <Pagination offset={offset} limit={PAGE_SIZE} itemCount={items.length} onOffsetChange={setOffset} />
    </div>
  );
}
