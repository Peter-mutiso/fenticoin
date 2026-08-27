'use client';

import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';

import { listInstruments } from '@/lib/api-client';
import { describeApiError } from '@/lib/api-errors';
import { useAuth } from '@/lib/auth/AuthContext';
import { useWalletBalance } from '@/hooks/useWalletBalance';
import { Notice } from '@/components/ui/Notice';
import { BalanceCard } from '@/components/wallet/BalanceCard';
import { InstrumentCard } from './InstrumentCard';

export function MarketsBrowser() {
  const [search, setSearch] = useState('');
  const { status: authStatus, isDemo } = useAuth();
  const walletQuery = useWalletBalance('USD');

  const instrumentsQuery = useQuery({
    queryKey: ['instruments'],
    queryFn: () => listInstruments(),
  });

  const instruments = instrumentsQuery.data?.items?.filter((i) => i.status === 'active') ?? [];
  const displayList = instruments;

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return displayList;
    return displayList.filter(
      (item) =>
        item.name.toLowerCase().includes(term) ||
        item.displaySymbol.toLowerCase().includes(term),
    );
  }, [displayList, search]);

  return (
    <div className="space-y-6 pb-20 max-w-xl mx-auto">
      {authStatus === 'authenticated' && walletQuery.data ? (
        <BalanceCard
          availableMinorUnits={walletQuery.data.availableMinorUnits}
          lockedMinorUnits={walletQuery.data.lockedMinorUnits}
          currency={walletQuery.data.currency}
          isDemo={isDemo}
        />
      ) : authStatus === 'authenticated' && walletQuery.error ? (
        <Notice text={describeApiError(walletQuery.error).title} />
      ) : authStatus === 'authenticated' ? (
        <div className="h-28 animate-pulse rounded-3xl bg-neutral-100" />
      ) : (
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-brand-500/30 bg-brand-50 p-4">
          <p className="text-sm font-semibold text-brand-700">Log in to see your balance.</p>
          <Link href="/login" className="shrink-0 rounded-full bg-brand-500 px-4 py-2 text-sm font-bold text-white transition hover:bg-brand-600">
            Log in
          </Link>
        </div>
      )}

      {/* Search Bar */}
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" aria-hidden="true" />
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search markets…"
          aria-label="Search markets"
          className="w-full rounded-2xl border border-neutral-200 bg-white py-3 pl-10 pr-3 text-sm outline-none focus:ring-2 focus:ring-brand-500"
        />
      </div>

      {instrumentsQuery.error && <Notice text={describeApiError(instrumentsQuery.error).title} className="mt-5" />}

      {/* Markets List Rows */}
      <div className="space-y-3">
        {instrumentsQuery.isPending ? (
          <p className="text-sm text-neutral-500">Loading instruments...</p>
        ) : filtered.length > 0 ? filtered.map((instrument) => (
          <InstrumentCard key={instrument.id} instrument={instrument} />
        )) : !instrumentsQuery.error && (
          <Notice text={search.trim() ? 'No markets match your search.' : 'No instruments available right now.'} />
        )}
      </div>
    </div>
  );
}