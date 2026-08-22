'use client';

import { useQuery } from '@tanstack/react-query';
import { TrendingUp } from 'lucide-react';
import Link from 'next/link';

import { listInstruments } from '@/lib/api-client';
import { describeApiError } from '@/lib/api-errors';
import { EmptyState } from '@/components/ui/EmptyState';
import { Notice } from '@/components/ui/Notice';
import { InstrumentPrice } from '@/components/markets/InstrumentPrice';

const FEATURED_COUNT = 4;

export function FeaturedInstruments() {
  const instrumentsQuery = useQuery({ queryKey: ['instruments'], queryFn: () => listInstruments() });
  const instruments = (instrumentsQuery.data?.items ?? []).filter((i) => i.status === 'active').slice(0, FEATURED_COUNT);

  return (
    <section aria-labelledby="featured-heading">
      <div className="flex items-center justify-between">
        <h2 id="featured-heading" className="text-lg font-bold text-neutral-900">
          Featured markets
        </h2>
        <Link href="/markets" className="text-sm font-semibold text-brand-600 hover:underline">
          View all
        </Link>
      </div>

      <div className="mt-3">
        {instrumentsQuery.isLoading ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-24 animate-pulse rounded-2xl bg-neutral-100" />
            ))}
          </div>
        ) : instrumentsQuery.error ? (
          <Notice text={describeApiError(instrumentsQuery.error).title} />
        ) : instruments.length === 0 ? (
          <EmptyState icon={TrendingUp} title="No instruments available right now." />
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {instruments.map((instrument) => (
              <Link
                key={instrument.id}
                href={`/markets/${instrument.id}`}
                className="rounded-2xl border border-neutral-200 bg-white p-3 shadow-sm transition hover:border-neutral-300"
              >
                <p className="truncate text-sm font-bold text-neutral-900">{instrument.displaySymbol}</p>
                <p className="truncate text-xs text-neutral-500">{instrument.name}</p>
                <InstrumentPrice instrumentId={instrument.id} currency={instrument.quoteCurrency} className="mt-2" />
              </Link>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
