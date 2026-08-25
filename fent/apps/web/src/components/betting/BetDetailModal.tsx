'use client';

import { useQuery } from '@tanstack/react-query';
import { X } from 'lucide-react';

import { getBet, isSettledBetStatus, type Instrument } from '@/lib/api-client';
import { describeApiError } from '@/lib/api-errors';
import { formatCurrencyMinorUnits, formatInstrumentPrice } from '@/lib/money';
import { Notice } from '@/components/ui/Notice';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useDialogA11y } from '@/lib/useDialogA11y';
import { BET_STATUS_STYLES, betLabel } from './BetRow';

export function BetDetailModal({ betId, instrument, onClose }: { betId: string; instrument?: Instrument; onClose: () => void }) {
  const betQuery = useQuery({ queryKey: ['bet', betId], queryFn: () => getBet(betId) });
  const bet = betQuery.data;
  const containerRef = useDialogA11y<HTMLDivElement>(onClose);

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-navy-950/50 p-0 sm:items-center sm:justify-center sm:p-4" role="dialog" aria-modal="true" aria-label="Bet details">
      <div ref={containerRef} tabIndex={-1} className="w-full rounded-t-3xl bg-white p-6 shadow-xl outline-none sm:max-w-md sm:rounded-3xl">
        <div className="flex items-start justify-between">
          <h2 className="text-xl font-bold">Bet details</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="text-neutral-400 transition hover:text-neutral-600">
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        {betQuery.isLoading && <div className="mt-4 h-32 animate-pulse rounded-2xl bg-neutral-100" />}
        {betQuery.error && <Notice text={describeApiError(betQuery.error).title} className="mt-4" />}

        {bet && (
          <div className="mt-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-neutral-900">{betLabel(bet, instrument)}</p>
              <StatusBadge status={bet.status} styles={BET_STATUS_STYLES} />
            </div>
            <dl className="mt-4 space-y-3 text-sm">
              <Row label="Stake" value={formatCurrencyMinorUnits(bet.stakeAmountMinorUnits, bet.currency)} />
              <Row
                label="Entry price"
                value={instrument ? formatInstrumentPrice(bet.entryPriceMinorUnits, instrument.pricePrecision, instrument.quoteCurrency) : bet.entryPriceMinorUnits}
              />
              {bet.targetPriceMinorUnits && (
                <Row
                  label="Strike price"
                  value={instrument ? formatInstrumentPrice(bet.targetPriceMinorUnits, instrument.pricePrecision, instrument.quoteCurrency) : bet.targetPriceMinorUnits}
                />
              )}
              <Row label="Payout rate" value={`${(Number(bet.payoutRateBasisPoints) / 100).toFixed(2)}% profit`} />
              <Row label="Potential payout" value={formatCurrencyMinorUnits(bet.potentialPayoutMinorUnits, bet.currency)} />
              <Row label="Placed" value={new Date(bet.placedAt).toLocaleString()} />
              <Row label="Expires" value={new Date(bet.expiresAt).toLocaleString()} />
              {isSettledBetStatus(bet.status) && bet.settlementPriceMinorUnits && (
                <Row
                  label="Settlement price"
                  value={instrument ? formatInstrumentPrice(bet.settlementPriceMinorUnits, instrument.pricePrecision, instrument.quoteCurrency) : bet.settlementPriceMinorUnits}
                />
              )}
              {bet.settledAt && <Row label="Settled" value={new Date(bet.settledAt).toLocaleString()} />}
              {bet.cancelReason && <Row label="Reason" value={bet.cancelReason} />}
            </dl>
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-neutral-500">{label}</dt>
      <dd className="text-right font-semibold text-neutral-900">{value}</dd>
    </div>
  );
}
