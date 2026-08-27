'use client';

import { useQueries } from '@tanstack/react-query';
import { Minus, TrendingDown, TrendingUp } from 'lucide-react';
import { useEffect, useState } from 'react';

import { getPrice, isSettledBetStatus, type Bet, type Instrument } from '@/lib/api-client';
import { formatCurrencyMinorUnits, formatInstrumentPrice } from '@/lib/money';
import { EmptyState } from '@/components/ui/EmptyState';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { BET_STATUS_STYLES, betLabel } from './BetRow';

/**
 * The prominent "Open Positions" list — every bet not yet settled, shown
 * with a live current price polled from the same server-authoritative
 * market data the trade page itself uses (`GET
 * /markets/instruments/:id/price`). This component never determines a
 * result: the price-movement arrow is a neutral "which way has the market
 * moved since entry" indicator, not a win/loss projection, and the
 * countdown is a cosmetic display timer — actual settlement, the bet's
 * status transition, and the wallet update all still come exclusively
 * from the server (surfaced here only once the parent's `bets` query
 * refetches and the bet drops out of this list). Reused on both the
 * trade workspace (`BetsPanel`) and bot detail pages, so a bot's own open
 * positions render identically to a manually placed one.
 */
export function OpenPositions({ bets, instruments, emptyHint }: { bets: Bet[]; instruments: Instrument[]; emptyHint?: string }) {
  const open = bets.filter((bet) => !isSettledBetStatus(bet.status));
  const instrumentById = new Map(instruments.map((instrument) => [instrument.id, instrument]));
  const instrumentIds = Array.from(new Set(open.map((bet) => bet.instrumentId)));

  const priceQueries = useQueries({
    queries: instrumentIds.map((id) => ({
      queryKey: ['price', id],
      queryFn: () => getPrice(id),
      refetchInterval: 5_000,
    })),
  });
  const priceByInstrumentId = new Map(instrumentIds.map((id, index) => [id, priceQueries[index]?.data]));

  return (
    <section aria-labelledby="open-positions-heading">
      <h2 id="open-positions-heading" className="flex items-center gap-2 text-lg font-bold text-neutral-900">
        Open positions
        {open.length > 0 && <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-bold text-brand-600">{open.length}</span>}
      </h2>
      {open.length === 0 ? (
        <div className="mt-3">
          <EmptyState icon={Minus} title="No open positions" description={emptyHint ?? 'Positions you place will appear here until they settle.'} />
        </div>
      ) : (
        <ul className="mt-3 space-y-2">
          {open.map((bet) => (
            <OpenPositionCard key={bet.id} bet={bet} instrument={instrumentById.get(bet.instrumentId)} currentPrice={priceByInstrumentId.get(bet.instrumentId)} />
          ))}
        </ul>
      )}
    </section>
  );
}

function OpenPositionCard({
  bet,
  instrument,
  currentPrice,
}: {
  bet: Bet;
  instrument?: Instrument;
  currentPrice?: { priceMinorUnits: string; isStale: boolean };
}) {
  const pricePrecision = instrument?.pricePrecision ?? 2;
  const remainingMs = useCountdown(bet.expiresAt);
  const awaitingSettlement = remainingMs <= 0;

  let movement: 'up' | 'down' | 'flat' | null = null;
  if (currentPrice) {
    const entry = BigInt(bet.entryPriceMinorUnits);
    const current = BigInt(currentPrice.priceMinorUnits);
    movement = current > entry ? 'up' : current < entry ? 'down' : 'flat';
  }

  return (
    <li className="rounded-2xl border border-neutral-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-neutral-900">{betLabel(bet, instrument)}</p>
          <p className="mt-0.5 text-xs text-neutral-500">
            Stake {formatCurrencyMinorUnits(bet.stakeAmountMinorUnits, bet.currency)} · Potential payout{' '}
            {formatCurrencyMinorUnits(bet.potentialPayoutMinorUnits, bet.currency)}
          </p>
        </div>
        <StatusBadge status={awaitingSettlement ? 'pending' : bet.status} styles={BET_STATUS_STYLES} />
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-xs sm:grid-cols-4">
        <Field label="Entry price" value={formatInstrumentPrice(bet.entryPriceMinorUnits, pricePrecision, bet.currency)} />
        <Field
          label="Current price"
          value={
            currentPrice ? (
              <span className="flex items-center gap-1">
                {formatInstrumentPrice(currentPrice.priceMinorUnits, pricePrecision, bet.currency)}
                {movement === 'up' && <TrendingUp className="h-3.5 w-3.5 text-brand-500" aria-label="Price has risen since entry" />}
                {movement === 'down' && <TrendingDown className="h-3.5 w-3.5 text-loss-500" aria-label="Price has fallen since entry" />}
              </span>
            ) : (
              '…'
            )
          }
        />
        <Field label="Time remaining" value={awaitingSettlement ? 'Settling…' : formatCountdown(remainingMs)} />
        <Field label="Payout rate" value={`${(Number(bet.payoutRateBasisPoints) / 100).toFixed(2)}%`} />
      </dl>
    </li>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-neutral-400">{label}</dt>
      <dd className="mt-0.5 font-semibold tabular-nums text-neutral-900">{value}</dd>
    </div>
  );
}

/** A cosmetic, second-resolution countdown to `expiresAt` — display only; the server alone decides when/how a bet actually settles. */
function useCountdown(expiresAt: string): number {
  const [remainingMs, setRemainingMs] = useState(() => new Date(expiresAt).getTime() - Date.now());

  useEffect(() => {
    const target = new Date(expiresAt).getTime();
    setRemainingMs(target - Date.now());
    const interval = setInterval(() => setRemainingMs(target - Date.now()), 1_000);
    return () => clearInterval(interval);
  }, [expiresAt]);

  return remainingMs;
}

function formatCountdown(remainingMs: number): string {
  const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) return `${seconds}s`;
  const hours = Math.floor(minutes / 60);
  if (hours === 0) return `${minutes}m ${seconds}s`;
  return `${hours}h ${minutes % 60}m`;
}
