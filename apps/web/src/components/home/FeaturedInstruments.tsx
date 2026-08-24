'use client';

import { useQuery } from '@tanstack/react-query';
import { TrendingUp, TrendingDown } from 'lucide-react';
import Link from 'next/link';

import { listInstruments } from '@/lib/api-client';

const MOCK_WATCHLIST = [
  { id: 'eth', symbol: 'ETH', name: 'Ethereum', price: '$4,588.81', change: '-5.62%', isNegative: true },
  { id: 'btc', symbol: 'BTC', name: 'Bitcoin', price: '$112,503.27', change: '-1.55%', isNegative: true },
  { id: 'usdc', symbol: 'USD', name: 'USDC', price: '$1.00', change: '-0.02%', isNegative: true },
  { id: 'sol', symbol: 'SOL', name: 'Solana', price: '$196.89', change: '-5.34%', isNegative: true },
];

export function FeaturedInstruments() {
  const instrumentsQuery = useQuery({ queryKey: ['instruments'], queryFn: () => listInstruments() });
  const apiItems = instrumentsQuery.data?.items?.filter((i) => i.status === 'active') ?? [];
  
  // Use API items if available, otherwise fall back to our exact FentiCoin mock coins
  const displayItems = apiItems.length > 0 ? apiItems.slice(0, 4) : null;

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
        {displayItems ? (
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
        ) : (
          // FentiCoin exact UI Match Fallback Grid
          <div className="grid grid-cols-2 gap-3">
            {MOCK_WATCHLIST.map((coin) => (
              <Link
                key={coin.id}
                href="/markets"
                className="relative overflow-hidden rounded-2xl border border-rose-100 bg-[#fef2f2] p-4 shadow-sm transition hover:border-rose-200"
              >
                {/* Red accent line on the left side */}
                <div className="absolute left-0 top-3 h-8 w-1 rounded-r bg-[#ef4444]" />

                <div className="flex items-start justify-between pl-2">
                  <p className="text-sm font-bold text-neutral-900">{coin.symbol}</p>
                  <span className="inline-flex items-center gap-0.5 text-xs font-bold text-red-500">
                    <TrendingDown className="h-3 w-3" />
                    {coin.change}
                  </span>
                </div>

                <div className="pl-2 mt-1">
                  <p className="text-xs font-medium text-neutral-400">{coin.symbol}</p>
                  <p className="text-xs text-neutral-500">{coin.name}</p>
                  <p className="mt-2 text-sm font-bold text-neutral-900">{coin.price}</p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}