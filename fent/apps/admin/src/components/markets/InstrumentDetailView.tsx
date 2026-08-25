'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import { listAdminInstruments, refreshInstrumentPrice, setInstrumentStatus, type Instrument } from '@/lib/api-client';
import { describeApiError } from '@/lib/api-errors';
import { RequirePermission } from '@/components/auth/RequirePermission';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Notice } from '@/components/ui/Notice';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { INSTRUMENT_STATUS_STYLES } from '@/components/finance/finance-display';
import { useConfirmedAction } from '@/lib/useConfirmedAction';
import { useToast } from '@/components/ui/Toast';
import { BettingConfigsPanel } from '@/components/betting/BettingConfigsPanel';

export function InstrumentDetailView({ instrumentId }: { instrumentId: string }) {
  const { show } = useToast();
  const queryClient = useQueryClient();
  const { confirm, dialogProps } = useConfirmedAction();
  const [refreshing, setRefreshing] = useState(false);

  // No single-instrument admin GET exists — the admin list endpoint is the read path; find this one in it.
  const query = useQuery({ queryKey: ['admin-instruments', true], queryFn: () => listAdminInstruments({ includeDelisted: true }) });
  const instrument = query.data?.items.find((item) => item.id === instrumentId);

  async function invalidate() {
    await queryClient.invalidateQueries({ queryKey: ['admin-instruments'] });
  }

  function confirmStatusChange(status: Instrument['status']) {
    confirm({
      title: `Set status to "${status}"?`,
      description:
        status === 'delisted'
          ? 'Delisting permanently removes this instrument from trading and hides it from default listings. Historical bets and price history are kept.'
          : status === 'suspended'
            ? 'This immediately pauses trading on this instrument.'
            : 'This reactivates trading on this instrument.',
      destructive: status !== 'active',
      reasonRequired: true,
      requireTypedConfirmation: status === 'delisted' ? 'DELIST' : undefined,
      confirmLabel: 'Confirm',
      successMessage: `Instrument ${status}`,
      onConfirm: async (reason) => {
        await setInstrumentStatus(instrumentId, status, reason ?? '');
        await invalidate();
      },
    });
  }

  async function handleRefresh() {
    setRefreshing(true);
    try {
      const result = await refreshInstrumentPrice(instrumentId);
      show({ tone: 'refreshed' in result ? 'info' : 'success', title: 'refreshed' in result ? 'No new price available' : 'Price refreshed' });
    } catch (thrown) {
      show({ tone: 'error', title: describeApiError(thrown).title });
    } finally {
      setRefreshing(false);
    }
  }

  if (query.isLoading) {
    return (
      <div className="space-y-3">
        <div className="h-8 w-1/3 animate-pulse rounded-lg bg-neutral-100" />
        <div className="h-32 animate-pulse rounded-2xl bg-neutral-100" />
      </div>
    );
  }

  if (query.error) return <Notice text={describeApiError(query.error).title} />;
  if (!instrument) return <Notice text="Instrument not found." />;

  return (
    <div>
      <Link href="/markets" className="inline-flex items-center gap-1 text-sm font-semibold text-neutral-500 hover:text-neutral-900">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Back to markets
      </Link>

      <div className="mt-3 rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-neutral-900">{instrument.displaySymbol}</h1>
            <p className="mt-0.5 text-sm text-neutral-500">{instrument.name}</p>
          </div>
          <StatusBadge status={instrument.status} styles={INSTRUMENT_STATUS_STYLES} />
        </div>

        <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
          <Row label="Category" value={instrument.categoryKey} />
          <Row label="Quote currency" value={instrument.quoteCurrency} />
          <Row label="Price precision" value={String(instrument.pricePrecision)} />
          <Row label="Max price age" value={`${instrument.maxPriceAgeSeconds}s`} />
        </dl>

        <RequirePermission permission="markets.manage">
          <div className="mt-4 flex flex-wrap gap-2 border-t border-neutral-100 pt-4">
            <button type="button" onClick={handleRefresh} disabled={refreshing} className="flex items-center gap-1.5 rounded-full bg-neutral-100 px-3 py-1.5 text-sm font-semibold text-neutral-700 hover:bg-neutral-200 disabled:opacity-50">
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} aria-hidden="true" />
              Refresh price
            </button>
            {instrument.status !== 'active' && (
              <button type="button" onClick={() => confirmStatusChange('active')} className="rounded-full bg-brand-500 px-3 py-1.5 text-sm font-bold text-white hover:bg-brand-600">
                Activate
              </button>
            )}
            {instrument.status !== 'suspended' && (
              <button type="button" onClick={() => confirmStatusChange('suspended')} className="rounded-full bg-amber-100 px-3 py-1.5 text-sm font-bold text-amber-800 hover:bg-amber-200">
                Suspend
              </button>
            )}
            {instrument.status !== 'delisted' && (
              <button type="button" onClick={() => confirmStatusChange('delisted')} className="rounded-full bg-loss-50 px-3 py-1.5 text-sm font-bold text-loss-500 hover:bg-red-100">
                Delist
              </button>
            )}
          </div>
        </RequirePermission>
      </div>

      <div className="mt-5">
        <h2 className="text-sm font-bold text-neutral-900">Odds &amp; betting configuration</h2>
        <div className="mt-2">
          <BettingConfigsPanel instrumentId={instrumentId} quoteCurrency={instrument.quoteCurrency} />
        </div>
      </div>

      <ConfirmDialog {...dialogProps} />
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-neutral-500">{label}</dt>
      <dd className="font-semibold text-neutral-900">{value}</dd>
    </div>
  );
}
