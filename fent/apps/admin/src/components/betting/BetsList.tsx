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
import { BetActionsModal } from './BetActionsModal';

const OPTIONS: { value: BetStatus; label: string }[] = [
  { value: 'open', label: 'Active' },
  { value: 'won', label: 'Won' },
  { value: 'lost', label: 'Lost' },
  { value: 'void', label: 'Void' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'disputed', label: 'Disputed' },
  { value: 'requires_review', label: 'Under review' },
];

const PAGE_SIZE = 25;

export function BetsList() {
  const [status, setStatus] = useState<BetStatus | null>('requires_review');
  const [offset, setOffset] = useState(0);
  const [openBetId, setOpenBetId] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ['admin-bets', 'all', status, offset],
    queryFn: () => listAdminBets({ status: status ?? undefined, limit: PAGE_SIZE, offset }),
  });

  const items = query.data?.items ?? [];

  return (
    <div>
      <FilterBar
        options={OPTIONS}
        value={status}
        onChange={(value) => {
          setStatus(value as BetStatus | null);
          setOffset(0);
        }}
      />

      <div className="mt-4">
        {query.isLoading ? (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-16 animate-pulse rounded-2xl bg-neutral-100" />
            ))}
          </div>
        ) : query.error ? (
          <Notice text={describeApiError(query.error).title} />
        ) : items.length === 0 ? (
          <EmptyState icon={Activity} title="No bets match this filter." />
        ) : (
          <ul className="space-y-2">
            {items.map((bet) => (
              <li key={bet.id}>
                <button type="button" onClick={() => setOpenBetId(bet.id)} className="flex w-full items-center justify-between gap-3 rounded-2xl border border-neutral-200 bg-white p-3 text-left transition hover:border-neutral-300 sm:p-4">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-neutral-900">
                      {bet.type.replace('_', '/')} · {bet.selection} · {formatCurrencyMinorUnits(bet.stakeAmountMinorUnits, bet.currency)}
                    </p>
                    <p className="mt-0.5 text-xs text-neutral-500">
                      User {bet.userId.slice(0, 8)} · {new Date(bet.placedAt).toLocaleString()}
                    </p>
                  </div>
                  <StatusBadge status={bet.status} styles={BET_STATUS_STYLES} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Pagination offset={offset} limit={PAGE_SIZE} itemCount={items.length} onOffsetChange={setOffset} />

      {openBetId && <BetActionsModal betId={openBetId} onClose={() => setOpenBetId(null)} />}
    </div>
  );
}
