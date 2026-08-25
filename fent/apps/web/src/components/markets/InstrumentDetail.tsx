'use client';

import { useQuery } from '@tanstack/react-query';
import { Search, TrendingUp } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

import { getBettingConfig, getInstrument, type BetType } from '@/lib/api-client';
import { describeApiError } from '@/lib/api-errors';
import { useAuth } from '@/lib/auth/AuthContext';
import { formatCurrencyMinorUnits } from '@/lib/money';
import { EmptyState } from '@/components/ui/EmptyState';
import { Notice } from '@/components/ui/Notice';
import { InstrumentPrice } from './InstrumentPrice';

const BET_TYPES: { type: BetType; title: string }[] = [
  { type: 'rise_fall', title: 'Rise / Fall' },
  { type: 'higher_lower', title: 'Higher / Lower' },
  { type: 'up_down', title: 'Up / Down' },
];

export function InstrumentDetail({ instrumentId }: { instrumentId: string }) {
  const { status: authStatus } = useAuth();
  const instrumentQuery = useQuery({ queryKey: ['instrument', instrumentId], queryFn: () => getInstrument(instrumentId) });

  if (instrumentQuery.isLoading) {
    return (
      <div className="space-y-3">
        <div className="h-8 w-1/3 animate-pulse rounded-lg bg-neutral-100" />
        <div className="h-32 animate-pulse rounded-2xl bg-neutral-100" />
      </div>
    );
  }

  if (instrumentQuery.error) {
    return (
      <EmptyState
        icon={Search}
        title="Market not found"
        description={describeApiError(instrumentQuery.error).title}
        action={{ label: 'Back to markets', href: '/markets' }}
      />
    );
  }

  const instrument = instrumentQuery.data;
  if (!instrument) return null;

  return (
    <div>
      <p className="text-sm font-semibold text-brand-600">{instrument.categoryKey}</p>
      <h1 className="mt-1 text-3xl font-bold tracking-tight">{instrument.displaySymbol}</h1>
      <p className="mt-1 text-sm text-neutral-500">{instrument.name}</p>

      {instrument.status !== 'active' && <Notice text="This market is currently closed." className="mt-4" />}

      <InstrumentPrice instrumentId={instrument.id} currency={instrument.quoteCurrency} className="mt-5" />

      <section className="mt-8" aria-labelledby="opportunities-heading">
        <h2 id="opportunities-heading" className="text-lg font-bold text-neutral-900">
          Betting opportunities
        </h2>

        {authStatus !== 'authenticated' ? (
          <div className="mt-3 flex items-center justify-between gap-3 rounded-2xl border border-brand-500/30 bg-brand-50 p-4">
            <p className="text-sm font-semibold text-brand-700">Log in to see odds and place a bet.</p>
            <Link href="/login" className="shrink-0 rounded-full bg-brand-500 px-4 py-2 text-sm font-bold text-white transition hover:bg-brand-600">
              Log in
            </Link>
          </div>
        ) : (
          <BettingOpportunities instrumentId={instrument.id} currency={instrument.quoteCurrency} />
        )}
      </section>
    </div>
  );
}

/** Renders one row per bet type, and — since each row independently decides whether its own market is available — tracks that availability here so an honest empty state can be shown once it's known that *none* of them are, rather than the section silently rendering nothing under its own heading. */
function BettingOpportunities({ instrumentId, currency }: { instrumentId: string; currency: string }) {
  const [availability, setAvailability] = useState<Record<BetType, boolean | null>>({
    rise_fall: null,
    higher_lower: null,
    up_down: null,
  });

  const reportAvailability = useCallback((betType: BetType, available: boolean) => {
    setAvailability((prev) => (prev[betType] === available ? prev : { ...prev, [betType]: available }));
  }, []);

  const values = Object.values(availability);
  const stillChecking = values.some((v) => v === null);
  const noneAvailable = !stillChecking && values.every((v) => v === false);

  return (
    <div className="mt-3 space-y-2">
      {BET_TYPES.map((betType) => (
        <BettingOpportunityRow
          key={betType.type}
          instrumentId={instrumentId}
          currency={currency}
          betType={betType.type}
          title={betType.title}
          onAvailabilityChange={reportAvailability}
        />
      ))}
      {noneAvailable && (
        <EmptyState icon={TrendingUp} title="No betting types are currently available for this market." description="Check back later, or explore other markets." />
      )}
    </div>
  );
}

function BettingOpportunityRow({
  instrumentId,
  currency,
  betType,
  title,
  onAvailabilityChange,
}: {
  instrumentId: string;
  currency: string;
  betType: BetType;
  title: string;
  onAvailabilityChange: (betType: BetType, available: boolean) => void;
}) {
  const configQuery = useQuery({
    queryKey: ['betting-config', instrumentId, betType],
    queryFn: () => getBettingConfig(instrumentId, betType),
    retry: false,
  });

  const available = configQuery.isSuccess && Boolean(configQuery.data.isEnabled);
  const settled = configQuery.isSuccess || configQuery.isError;

  useEffect(() => {
    if (settled) onAvailabilityChange(betType, available);
  }, [settled, available, betType, onAvailabilityChange]);

  if (configQuery.isLoading) {
    return <div className="h-16 animate-pulse rounded-2xl bg-neutral-100" />;
  }

  if (!available || !configQuery.data) {
    return null;
  }

  const config = configQuery.data;

  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-neutral-200 bg-white p-4">
      <div>
        <p className="text-sm font-bold text-neutral-900">{title}</p>
        <p className="mt-0.5 text-xs text-neutral-500">
          Stake {formatCurrencyMinorUnits(config.minStakeMinorUnits, currency)}–{formatCurrencyMinorUnits(config.maxStakeMinorUnits, currency)} ·{' '}
          {(Number(config.payoutRateBasisPoints) / 100).toFixed(2)}% profit
        </p>
      </div>
      <Link
        href={`/dashboard?instrument=${instrumentId}&type=${betType}`}
        className="shrink-0 rounded-full bg-brand-500 px-4 py-2 text-sm font-bold text-white transition hover:bg-brand-600"
      >
        Bet now
      </Link>
    </div>
  );
}
