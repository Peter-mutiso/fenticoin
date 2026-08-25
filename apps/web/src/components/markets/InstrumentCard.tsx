'use client';

import Link from 'next/link';
import type { Instrument } from '@/lib/api-client';
import { InstrumentPrice } from './InstrumentPrice';

export function InstrumentCard({ instrument }: { instrument: Instrument }) {
  // Generate a distinct pastel background color for each token icon circle
  const iconColors = [
    'bg-emerald-500 text-white',
    'bg-amber-400 text-neutral-950',
    'bg-blue-600 text-white',
    'bg-violet-600 text-white',
    'bg-cyan-500 text-neutral-950'
  ];
  const colorClass = iconColors[instrument.id.charCodeAt(0) % iconColors.length];
  const symbolLetter = instrument.displaySymbol.charAt(0);

  return (
    <Link
      href={`/markets/${instrument.id}`}
      className="flex items-center justify-between rounded-2xl border border-neutral-100 bg-white p-4 shadow-sm transition hover:border-neutral-200"
    >
      {/* Left side: Icon badge + symbol name + volume */}
      <div className="flex items-center gap-3 min-w-0">
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full font-bold text-sm ${colorClass}`}>
          {symbolLetter}
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-neutral-900">
            {instrument.displaySymbol.replace('/', ' / ')}
          </p>
          <p className="truncate text-xs text-neutral-400">Market data available</p>
        </div>
      </div>

      {/* Right side: Last price and 24h Change Pill Badge */}
      <div className="text-right shrink-0">
        <div className="text-sm font-bold text-neutral-900">
          <InstrumentPrice instrumentId={instrument.id} currency={instrument.quoteCurrency} />
        </div>
      </div>
    </Link>
  );
}