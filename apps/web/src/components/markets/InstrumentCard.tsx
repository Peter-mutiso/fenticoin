import { CheckCircle2, MinusCircle, XCircle } from 'lucide-react';
import Link from 'next/link';

import type { Instrument } from '@/lib/api-client';
import { StatusBadge, type StatusStyle } from '@/components/ui/StatusBadge';
import { InstrumentPrice } from './InstrumentPrice';

const INSTRUMENT_STATUS_STYLES: Record<Instrument['status'], StatusStyle> = {
  active: { label: 'Open', className: 'bg-brand-50 text-brand-600', icon: CheckCircle2 },
  suspended: { label: 'Suspended', className: 'bg-amber-50 text-amber-700', icon: MinusCircle },
  delisted: { label: 'Delisted', className: 'bg-neutral-100 text-neutral-500', icon: XCircle },
};

export function InstrumentCard({ instrument }: { instrument: Instrument }) {
  return (
    <Link
      href={`/markets/${instrument.id}`}
      className="block rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm transition hover:border-neutral-300 sm:p-5"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-neutral-900">{instrument.displaySymbol}</p>
          <p className="truncate text-xs text-neutral-500">{instrument.name}</p>
        </div>
        <StatusBadge status={instrument.status} styles={INSTRUMENT_STATUS_STYLES} />
      </div>
      <InstrumentPrice instrumentId={instrument.id} currency={instrument.quoteCurrency} className="mt-3" />
    </Link>
  );
}
