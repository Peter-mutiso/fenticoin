'use client';

import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';

import { listInstruments } from '@/lib/api-client';
import { describeApiError } from '@/lib/api-errors';
import { useAuth } from '@/lib/auth/AuthContext';
import { useWalletBalance } from '@/hooks/useWalletBalance';
import { formatCurrencyMinorUnits } from '@/lib/money';
import { Notice } from '@/components/ui/Notice';
import { InstrumentCard } from './InstrumentCard';

export function MarketsBrowser() {
  const [search, setSearch] = useState('');
  const { status: authStatus } = useAuth();
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
      {/* Account Balance & Real/Demo Selector Card */}
      <div className="rounded-3xl bg-white p-5 shadow-xl border border-neutral-100 sm:p-6 text-neutral-900">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-neutral-500">Account Balance</h2>
          <div className="flex gap-1">
            <span className="h-2 w-2 rounded-full bg-amber-400" />
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            <span className="h-2 w-2 rounded-full bg-blue-600" />
          </div>
        </div>

        <div className="mt-4 flex items-baseline justify-between">
          <span className="text-xs text-neutral-400">Current Balance</span>
          <span className="text-2xl font-extrabold text-neutral-950">
            {authStatus !== 'authenticated'
              ? 'Log in to view'
              : walletQuery.isPending
                ? 'Loading…'
                : walletQuery.data
                  ? formatCurrencyMinorUnits(walletQuery.data.availableMinorUnits, walletQuery.data.currency)
                  : 'Unavailable'}
          </span>
        </div>

        {/* Action Buttons: Green Deposit & Red Withdraw */}
        <div className="mt-5 grid grid-cols-2 gap-3">
          <Link
            href="/account/deposit"
            className="flex items-center justify-center rounded-2xl bg-[#00C853] py-3.5 text-sm font-bold text-neutral-950 shadow-lg shadow-emerald-500/20 transition hover:bg-[#00b048]"
          >
            Deposit
          </Link>
          <Link
            href="/account/withdraw"
            className="flex items-center justify-center rounded-2xl bg-[#ff2d55] py-3.5 text-sm font-bold text-white shadow-lg shadow-rose-500/20 transition hover:bg-[#e0264a]"
          >
            Withdraw
          </Link>
        </div>
      </div>

      {/* Table header */}
      <div className="flex items-center justify-between px-2 text-xs font-semibold text-neutral-400 uppercase tracking-wider">
        <span>Name</span>
        <span>Last Price</span>
      </div>

      {/* Search Bar */}
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" aria-hidden="true" />
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search markets…"
          aria-label="Search markets"
          className="w-full rounded-2xl border border-neutral-200 bg-white py-3 pl-10 pr-3 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
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