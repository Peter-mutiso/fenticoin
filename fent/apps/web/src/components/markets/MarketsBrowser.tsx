'use client';

import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { useMemo, useState } from 'react';

import { listInstruments, listMarketCategories } from '@/lib/api-client';
import { describeApiError } from '@/lib/api-errors';
import { Notice } from '@/components/ui/Notice';
import { InstrumentCard } from './InstrumentCard';

// Fallback mock items matching the exact FentiCoin markets layout
const MOCK_MARKETS = [
  { id: 'spk', displaySymbol: 'SPK/USDT', name: 'Spark', quoteCurrency: 'USDT', status: 'active' },
  { id: 'kat', displaySymbol: 'KAT/USDT', name: 'Katon', quoteCurrency: 'USDT', status: 'active' },
  { id: 'zec', displaySymbol: 'ZEC/USDT', name: 'Zcash', quoteCurrency: 'USDT', status: 'active' },
  { id: 'doge', displaySymbol: 'DOGE/USDT', name: 'Dogecoin', quoteCurrency: 'USDT', status: 'active' },
  { id: 'usdc', displaySymbol: 'USDC/USDT', name: 'USD Coin', quoteCurrency: 'USDT', status: 'active' },
  { id: 'rlusd', displaySymbol: 'RLUSD/USDT', name: 'Ripple USD', quoteCurrency: 'USDT', status: 'active' },
];

export function MarketsBrowser() {
  const [search, setSearch] = useState('');
  const [accountType, setAccountType] = useState<'real' | 'demo'>('real');

  const categoriesQuery = useQuery({ queryKey: ['market-categories'], queryFn: listMarketCategories });
  const instrumentsQuery = useQuery({
    queryKey: ['instruments'],
    queryFn: () => listInstruments(),
  });

  const instruments = instrumentsQuery.data?.items?.filter((i) => i.status === 'active') ?? [];
  const displayList = instruments.length > 0 ? instruments : MOCK_MARKETS;

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

        {/* Real / Demo Toggle Tabs */}
        <div className="mt-4 flex rounded-full bg-neutral-100 p-1">
          <button
            type="button"
            onClick={() => setAccountType('real')}
            className={`flex-1 rounded-full py-2.5 text-xs font-bold transition ${
              accountType === 'real' ? 'bg-[#00C853] text-neutral-950 shadow-md' : 'text-neutral-500'
            }`}
          >
            Real Account
          </button>
          <button
            type="button"
            onClick={() => setAccountType('demo')}
            className={`flex-1 rounded-full py-2.5 text-xs font-bold transition ${
              accountType === 'demo' ? 'bg-[#00C853] text-neutral-950 shadow-md' : 'text-neutral-500'
            }`}
          >
            Demo Account
          </button>
        </div>

        <div className="mt-5 flex items-baseline justify-between">
          <span className="text-xs text-neutral-400">Current Balance</span>
          <span className="text-2xl font-extrabold text-neutral-950">
            {accountType === 'real' ? '$100.82' : '$10,000.00'}
          </span>
        </div>

        {/* Action Buttons: Green Deposit & Red Withdraw */}
        <div className="mt-5 grid grid-cols-2 gap-3">
          <a
            href="/deposit"
            className="flex items-center justify-center rounded-2xl bg-[#00C853] py-3.5 text-sm font-bold text-neutral-950 shadow-lg shadow-emerald-500/20 transition hover:bg-[#00b048]"
          >
            Deposit
          </a>
          <a
            href="/withdraw"
            className="flex items-center justify-center rounded-2xl bg-[#ff2d55] py-3.5 text-sm font-bold text-white shadow-lg shadow-rose-500/20 transition hover:bg-[#e0264a]"
          >
            Withdraw
          </a>
        </div>
      </div>

      {/* Table Headers (Name / Vol | Last Price | 24h chg) */}
      <div className="flex items-center justify-between px-2 text-xs font-semibold text-neutral-400 uppercase tracking-wider">
        <span>Name / Vol</span>
        <div className="flex gap-12 text-right">
          <span>Last Price</span>
          <span>24h chg</span>
        </div>
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
        {filtered.map((instrument) => (
          <InstrumentCard key={instrument.id} instrument={instrument as any} />
        ))}
      </div>
    </div>
  );
}