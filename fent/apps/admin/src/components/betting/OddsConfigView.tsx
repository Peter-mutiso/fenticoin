'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { listAdminInstruments } from '@/lib/api-client';
import { describeApiError } from '@/lib/api-errors';
import { Notice } from '@/components/ui/Notice';
import { BettingConfigsPanel } from './BettingConfigsPanel';

export function OddsConfigView() {
  const [instrumentId, setInstrumentId] = useState('');
  const instrumentsQuery = useQuery({ queryKey: ['admin-instruments', false], queryFn: () => listAdminInstruments() });

  const instrument = instrumentsQuery.data?.items.find((item) => item.id === instrumentId);

  return (
    <div>
      {instrumentsQuery.isLoading ? (
        <div className="h-12 animate-pulse rounded-xl bg-neutral-100" />
      ) : instrumentsQuery.error ? (
        <Notice text={describeApiError(instrumentsQuery.error).title} />
      ) : (
        <select
          value={instrumentId}
          onChange={(event) => setInstrumentId(event.target.value)}
          aria-label="Instrument"
          className="w-full rounded-xl border border-neutral-200 bg-white px-3 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-500"
        >
          <option value="">Select an instrument…</option>
          {(instrumentsQuery.data?.items ?? []).map((item) => (
            <option key={item.id} value={item.id}>
              {item.displaySymbol} · {item.name}
            </option>
          ))}
        </select>
      )}

      {instrument && (
        <div className="mt-5">
          <BettingConfigsPanel instrumentId={instrument.id} quoteCurrency={instrument.quoteCurrency} />
        </div>
      )}
    </div>
  );
}
