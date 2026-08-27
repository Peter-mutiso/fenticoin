'use client';

import { useQuery } from '@tanstack/react-query';
import { History } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';

import { listBets, listInstruments, type BetStatus } from '@/lib/api-client';
import { describeApiError } from '@/lib/api-errors';
import { useAuth } from '@/lib/auth/AuthContext';
import { EmptyState } from '@/components/ui/EmptyState';
import { FilterBar } from '@/components/ui/FilterBar';
import { Notice } from '@/components/ui/Notice';
import { Pagination } from '@/components/ui/Pagination';
import { BetDetailModal } from './BetDetailModal';
import { BetRow } from './BetRow';

const STATUS_OPTIONS: { value: BetStatus; label: string }[] = [
  { value: 'open', label: 'Active' },
  { value: 'won', label: 'Won' },
  { value: 'lost', label: 'Lost' },
  { value: 'void', label: 'Void' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'refunded', label: 'Refunded' },
  { value: 'requires_review', label: 'Under review' },
];

const PAGE_SIZE = 20;

export function BetHistoryList() {
  const { status: authStatus } = useAuth();
  const enabled = authStatus === 'authenticated';

  const [statusFilter, setStatusFilter] = useState<BetStatus | null>(null);
  const [instrumentFilter, setInstrumentFilter] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const [openBetId, setOpenBetId] = useState<string | null>(null);

  const betsQuery = useQuery({
    queryKey: ['bets', 'history', statusFilter, offset],
    queryFn: () => listBets({ status: statusFilter ?? undefined, limit: PAGE_SIZE, offset }),
    enabled,
  });
  const instrumentsQuery = useQuery({ queryKey: ['instruments'], queryFn: () => listInstruments(), enabled });

  const instrumentById = useMemo(
    () => new Map((instrumentsQuery.data?.items ?? []).map((instrument) => [instrument.id, instrument])),
    [instrumentsQuery.data],
  );

  const bets = betsQuery.data?.items ?? [];
  // Instrument has no server-side filter param — applied client-side over the current page only.
  const visibleBets = instrumentFilter ? bets.filter((bet) => bet.instrumentId === instrumentFilter) : bets;

  const instrumentOptions = (instrumentsQuery.data?.items ?? []).map((instrument) => ({ value: instrument.id, label: instrument.displaySymbol }));

  if (authStatus === 'unauthenticated') {
    return (
      <div className="flex items-center justify-between gap-3 rounded-2xl border border-brand-500/30 bg-brand-50 p-4">
        <p className="text-sm font-semibold text-brand-700">Log in to see your bet history.</p>
        <Link href="/login" className="shrink-0 rounded-full bg-brand-500 px-4 py-2 text-sm font-bold text-navy-950 transition hover:bg-brand-600">
          Log in
        </Link>
      </div>
    );
  }

  return (
    <div>
      <FilterBar
        options={STATUS_OPTIONS}
        value={statusFilter}
        onChange={(value) => {
          setStatusFilter(value as BetStatus | null);
          setOffset(0);
        }}
      />

      {instrumentOptions.length > 0 && (
        <div className="mt-3">
          <label className="text-xs font-semibold text-neutral-500">
            Instrument
            <select
              value={instrumentFilter ?? ''}
              onChange={(event) => setInstrumentFilter(event.target.value || null)}
              className="mt-1 block w-full rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500 sm:w-64"
            >
              <option value="">All instruments</option>
              {instrumentOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      <div className="mt-4">
        {betsQuery.isLoading ? (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-16 animate-pulse rounded-2xl bg-neutral-100" />
            ))}
          </div>
        ) : betsQuery.error ? (
          <Notice text={describeApiError(betsQuery.error).title} />
        ) : visibleBets.length === 0 ? (
          <EmptyState
            icon={History}
            title={statusFilter || instrumentFilter ? 'No bets match these filters.' : "You haven't placed any bets yet."}
          />
        ) : (
          <ul className="space-y-2">
            {visibleBets.map((bet) => (
              <BetRow key={bet.id} bet={bet} instrument={instrumentById.get(bet.instrumentId)} onClick={() => setOpenBetId(bet.id)} />
            ))}
          </ul>
        )}
      </div>

      <Pagination offset={offset} limit={PAGE_SIZE} itemCount={bets.length} onOffsetChange={setOffset} />

      {openBetId && <BetDetailModal betId={openBetId} instrument={instrumentById.get(bets.find((b) => b.id === openBetId)?.instrumentId ?? '')} onClose={() => setOpenBetId(null)} />}
    </div>
  );
}
