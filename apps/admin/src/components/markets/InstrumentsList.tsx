'use client';

import { useQuery } from '@tanstack/react-query';
import { TrendingUp } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import { listAdminInstruments } from '@/lib/api-client';
import { describeApiError } from '@/lib/api-errors';
import { RequirePermission } from '@/components/auth/RequirePermission';
import { EmptyState } from '@/components/ui/EmptyState';
import { Notice } from '@/components/ui/Notice';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { INSTRUMENT_STATUS_STYLES } from '@/components/finance/finance-display';
import { CreateInstrumentForm } from './CreateInstrumentForm';

export function InstrumentsList() {
  const [includeDelisted, setIncludeDelisted] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const query = useQuery({
    queryKey: ['admin-instruments', includeDelisted],
    queryFn: () => listAdminInstruments({ includeDelisted }),
  });

  const items = query.data?.items ?? [];

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-sm font-semibold text-neutral-700">
          <input type="checkbox" checked={includeDelisted} onChange={(event) => setIncludeDelisted(event.target.checked)} className="rounded border-neutral-300" />
          Include delisted
        </label>
        <RequirePermission permission="markets.manage">
          <button type="button" onClick={() => setShowCreate((value) => !value)} className="rounded-full bg-brand-500 px-4 py-2 text-sm font-bold text-white transition hover:bg-brand-600">
            {showCreate ? 'Cancel' : 'New instrument'}
          </button>
        </RequirePermission>
      </div>

      {showCreate && (
        <RequirePermission permission="markets.manage">
          <div className="mt-4">
            <CreateInstrumentForm onCreated={() => setShowCreate(false)} />
          </div>
        </RequirePermission>
      )}

      <div className="mt-5">
        {query.isLoading ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-24 animate-pulse rounded-2xl bg-neutral-100" />
            ))}
          </div>
        ) : query.error ? (
          <Notice text={describeApiError(query.error).title} />
        ) : items.length === 0 ? (
          <EmptyState icon={TrendingUp} title="No instruments yet." />
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((instrument) => (
              <Link key={instrument.id} href={`/markets/${instrument.id}`} className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm transition hover:border-neutral-300">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-neutral-900">{instrument.displaySymbol}</p>
                    <p className="truncate text-xs text-neutral-500">{instrument.name}</p>
                  </div>
                  <StatusBadge status={instrument.status} styles={INSTRUMENT_STATUS_STYLES} />
                </div>
                <p className="mt-3 text-xs text-neutral-400">{instrument.categoryKey}</p>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
