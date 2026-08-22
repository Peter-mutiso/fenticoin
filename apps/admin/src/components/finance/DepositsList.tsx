'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Landmark, RefreshCw } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import { listAdminDeposits, reconcileDeposits, resolveDeposit, type DepositStatus } from '@/lib/api-client';
import { describeApiError } from '@/lib/api-errors';
import { formatCurrencyMinorUnits } from '@/lib/money';
import { RequirePermission } from '@/components/auth/RequirePermission';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { FilterBar } from '@/components/ui/FilterBar';
import { Notice } from '@/components/ui/Notice';
import { Pagination } from '@/components/ui/Pagination';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useConfirmedAction } from '@/lib/useConfirmedAction';
import { useToast } from '@/components/ui/Toast';
import { DEPOSIT_STATUS_STYLES } from './finance-display';

const OPTIONS: { value: DepositStatus; label: string }[] = [
  { value: 'pending', label: 'Pending' },
  { value: 'completed', label: 'Completed' },
  { value: 'failed', label: 'Failed' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'expired', label: 'Expired' },
];

const PAGE_SIZE = 25;

export function DepositsList() {
  const [status, setStatus] = useState<DepositStatus | null>('pending');
  const [offset, setOffset] = useState(0);
  const { show } = useToast();
  const queryClient = useQueryClient();
  const { confirm, dialogProps } = useConfirmedAction();

  // 30s polling fallback alongside the real-time layer's push invalidation
  // — apps/admin has no other polling, so this is what keeps this list
  // current if the socket is ever unavailable.
  const query = useQuery({
    queryKey: ['admin-deposits', 'all', status, offset],
    queryFn: () => listAdminDeposits({ status: status ?? undefined, limit: PAGE_SIZE, offset }),
    refetchInterval: 30_000,
  });

  const items = query.data?.items ?? [];

  function confirmResolve(depositId: string, outcome: 'completed' | 'failed') {
    confirm({
      title: outcome === 'completed' ? 'Manually mark this deposit completed?' : 'Manually mark this deposit failed?',
      description: 'Only use this after confirming the outcome out-of-band with the payment provider — this skips automatic re-verification.',
      destructive: outcome === 'failed',
      reasonRequired: true,
      confirmLabel: 'Confirm',
      successMessage: 'Deposit resolved',
      onConfirm: async (reason) => {
        await resolveDeposit(depositId, outcome, reason ?? '');
        await queryClient.invalidateQueries({ queryKey: ['admin-deposits'] });
      },
    });
  }

  function confirmReconcile() {
    confirm({
      title: 'Reconcile all pending deposits with the provider?',
      description: 'Independently re-checks every pending deposit against the payment provider and auto-resolves any that have actually settled or failed — a bulk action affecting potentially many users at once.',
      confirmLabel: 'Reconcile',
      onConfirm: async () => {
        const result = await reconcileDeposits();
        show({ tone: 'info', title: `Reconciled: ${result.resolved} resolved, ${result.stillPending} still pending, ${result.errors} errors` });
        await queryClient.invalidateQueries({ queryKey: ['admin-deposits'] });
      },
    });
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <FilterBar
          options={OPTIONS}
          value={status}
          onChange={(value) => {
            setStatus(value as DepositStatus | null);
            setOffset(0);
          }}
        />
        <RequirePermission permission="deposits.approve">
          <button
            type="button"
            onClick={confirmReconcile}
            className="flex items-center gap-1.5 rounded-full bg-neutral-100 px-3 py-1.5 text-sm font-semibold text-neutral-700 hover:bg-neutral-200 disabled:opacity-50"
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
            Reconcile with provider
          </button>
        </RequirePermission>
      </div>

      <div className="mt-4">
        {query.isLoading ? (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-16 animate-pulse rounded-2xl bg-neutral-100" />
            ))}
          </div>
        ) : query.error ? (
          <Notice text={describeApiError(query.error).title} />
        ) : items.length === 0 ? (
          <EmptyState icon={Landmark} title="No deposits match this filter." />
        ) : (
          <ul className="space-y-2">
            {items.map((deposit) => (
              <li key={deposit.id} className="rounded-2xl border border-neutral-200 bg-white p-3 sm:p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-neutral-900">{formatCurrencyMinorUnits(deposit.amountMinorUnits, deposit.currency)}</p>
                    <p className="mt-0.5 text-xs text-neutral-500">
                      <Link href={`/users/${deposit.userId}?tab=Deposits`} className="hover:underline">
                        User {deposit.userId.slice(0, 8)}
                      </Link>
                      {' · '}
                      {new Date(deposit.createdAt).toLocaleString()} · {deposit.providerName ?? 'no provider'}
                    </p>
                  </div>
                  <StatusBadge status={deposit.status} styles={DEPOSIT_STATUS_STYLES} />
                </div>
                {deposit.status === 'pending' && (
                  <RequirePermission permission="deposits.approve">
                    <div className="mt-3 flex gap-2 border-t border-neutral-100 pt-3">
                      <button type="button" onClick={() => confirmResolve(deposit.id, 'completed')} className="rounded-full bg-brand-50 px-3 py-1.5 text-xs font-bold text-brand-600 hover:bg-brand-100">
                        Mark completed
                      </button>
                      <button type="button" onClick={() => confirmResolve(deposit.id, 'failed')} className="rounded-full bg-loss-50 px-3 py-1.5 text-xs font-bold text-loss-500 hover:bg-red-100">
                        Mark failed
                      </button>
                    </div>
                  </RequirePermission>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <Pagination offset={offset} limit={PAGE_SIZE} itemCount={items.length} onOffsetChange={setOffset} />
      <ConfirmDialog {...dialogProps} />
    </div>
  );
}
