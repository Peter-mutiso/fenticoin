'use client';

import { useQuery } from '@tanstack/react-query';
import { TrendingUp, TrendingDown } from 'lucide-react';
import Link from 'next/link';

import { listInstruments } from '@/lib/api-client';
import { Notice } from '@/components/ui/Notice';

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
        <Link href="/markets" className="text-sm font-semibold text-emerald-600 hover:underline">
          See All &gt;
        </Link>
      </div>

      <div className="mt-3">
        {displayItems.length > 0 ? (
          <div className="grid grid-cols-2 gap-3">
            {displayItems.map((instrument, index) => {
              const isNegative = index % 2 === 0;
              return (
                <Link
                  key={instrument.id}
                  href={`/markets/${instrument.id}`}
                  className="relative overflow-hidden rounded-2xl border border-rose-100 bg-[#fef2f2] p-4 shadow-sm transition hover:border-rose-200"
                >
                  <div className="absolute left-0 top-3 h-8 w-1 rounded-r bg-[#ef4444]" />
                  <div className="flex items-start justify-between pl-2">
                    <p className="text-sm font-bold text-neutral-900">{instrument.displaySymbol.split('/')[0]}</p>
                    <span className={`inline-flex items-center gap-0.5 text-xs font-bold ${isNegative ? 'text-red-500' : 'text-emerald-600'}`}>
                      {isNegative ? <TrendingDown className="h-3 w-3" /> : <TrendingUp className="h-3 w-3" />}
                      {isNegative ? '-1.55%' : '+0.29%'}
                    </span>
                  </div>
                  <div className="pl-2 mt-1">
                    <p className="text-xs font-medium text-neutral-400">{instrument.displaySymbol}</p>
                    <p className="text-xs text-neutral-500 truncate">{instrument.name}</p>
                  </div>
                </Link>
              );
            })}
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