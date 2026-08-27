'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';

import { listInstruments } from '@/lib/api-client';
import { Notice } from '@/components/ui/Notice';
import { InstrumentPrice } from '@/components/markets/InstrumentPrice';

export function FeaturedInstruments() {
  const instrumentsQuery = useQuery({ queryKey: ['instruments'], queryFn: () => listInstruments() });
  const apiItems = instrumentsQuery.data?.items?.filter((i) => i.status === 'active') ?? [];
  const displayItems = apiItems.slice(0, 4);

  return (
    <section aria-labelledby="featured-heading">
      <div className="flex items-center justify-between">
        <h2 id="featured-heading" className="text-lg font-bold text-neutral-900">
          Watchlist
        </h2>
        <Link href="/markets" className="text-sm font-semibold text-brand-600 hover:underline">
          See All &gt;
        </Link>
      </div>

      <div className="mt-3">
        {displayItems.length > 0 ? (
          <div className="grid grid-cols-2 gap-3">
            {displayItems.map((instrument) => (
              <Link
                key={instrument.id}
                href={`/markets/${instrument.id}`}
                className="block rounded-2xl border border-neutral-100 bg-white p-4 shadow-sm transition hover:border-neutral-200"
              >
                <p className="text-sm font-bold text-neutral-900">{instrument.displaySymbol.split('/')[0]}</p>
                <p className="mt-0.5 truncate text-xs text-neutral-500">{instrument.name}</p>
                <div className="mt-2">
                  <InstrumentPrice instrumentId={instrument.id} currency={instrument.quoteCurrency} compact />
                </div>
              </Link>
            ))}
          </div>
        ) : instrumentsQuery.error ? (
          <Notice text="Unable to load featured instruments." />
        ) : (
          <Notice text="No instruments available right now." />
        )}
      </div>
    </section>
  );
}