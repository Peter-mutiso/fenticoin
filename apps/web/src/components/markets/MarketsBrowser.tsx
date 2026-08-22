'use client';

import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { useMemo, useState } from 'react';

import { listInstruments, listMarketCategories } from '@/lib/api-client';
import { describeApiError } from '@/lib/api-errors';
import { EmptyState } from '@/components/ui/EmptyState';
import { FilterBar } from '@/components/ui/FilterBar';
import { Notice } from '@/components/ui/Notice';
import { InstrumentCard } from './InstrumentCard';

export function MarketsBrowser() {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<string | null>(null);

  const categoriesQuery = useQuery({ queryKey: ['market-categories'], queryFn: listMarketCategories });
  const instrumentsQuery = useQuery({
    queryKey: ['instruments', category],
    queryFn: () => listInstruments(category ? { category } : {}),
  });

  const filtered = useMemo(() => {
    const instruments = instrumentsQuery.data?.items ?? [];
    const term = search.trim().toLowerCase();
    if (!term) return instruments;
    return instruments.filter(
      (instrument) =>
        instrument.name.toLowerCase().includes(term) ||
        instrument.displaySymbol.toLowerCase().includes(term) ||
        instrument.symbol.toLowerCase().includes(term),
    );
  }, [instrumentsQuery.data, search]);

  const categoryOptions = (categoriesQuery.data?.items ?? [])
    .filter((c) => c.isActive)
    .sort((a, b) => a.displayOrder - b.displayOrder)
    .map((c) => ({ value: c.key, label: c.name }));

  return (
    <div>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" aria-hidden="true" />
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search markets…"
          aria-label="Search markets"
          className="w-full rounded-xl border border-neutral-200 bg-white py-3 pl-10 pr-3 text-sm outline-none focus:ring-2 focus:ring-brand-500"
        />
      </div>

      {categoryOptions.length > 0 && (
        <div className="mt-4">
          <FilterBar options={categoryOptions} value={category} onChange={setCategory} />
        </div>
      )}

      {instrumentsQuery.isLoading && (
        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-32 animate-pulse rounded-2xl bg-neutral-100" />
          ))}
        </div>
      )}

      {instrumentsQuery.error && <Notice text={describeApiError(instrumentsQuery.error).title} className="mt-5" />}

      {!instrumentsQuery.isLoading && !instrumentsQuery.error && filtered.length === 0 && (
        <div className="mt-5">
          <EmptyState
            icon={Search}
            title={search || category ? 'No markets match your search.' : 'No instruments available right now.'}
          />
        </div>
      )}

      {filtered.length > 0 && (
        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((instrument) => (
            <InstrumentCard key={instrument.id} instrument={instrument} />
          ))}
        </div>
      )}
    </div>
  );
}
