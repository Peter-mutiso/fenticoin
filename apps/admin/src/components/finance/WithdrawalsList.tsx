'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Coins, RefreshCw } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import { approveWithdrawal, listAdminWithdrawals, reconcileWithdrawals, rejectWithdrawal, reverseWithdrawal, type WithdrawalStatus } from '@/lib/api-client';
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
import { WITHDRAWAL_STATUS_STYLES } from './finance-display';

const OPTIONS: { value: WithdrawalStatus; label: string }[] = [
  { value: 'pending_review', label: 'Pending review' },
  { value: 'approved', label: 'Approved' },
  { value: 'submitted', label: 'Submitted' },
  { value: 'completed', label: 'Completed' },
  { value: 'failed', label: 'Failed' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'reversed', label: 'Reversed' },
];

const PAGE_SIZE = 25;

export function WithdrawalsList() {
  const [status, setStatus] = useState<WithdrawalStatus | null>('pending_review');
  const [offset, setOffset] = useState(0);
  const { show } = useToast();
  const queryClient = useQueryClient();
  const { confirm, dialogProps } = useConfirmedAction();

  // 30s polling fallback alongside the real-time layer's push invalidation
  // — apps/admin has no other polling, so this is what keeps this list
  // current if the socket is ever unavailable.
  const query = useQuery({
    queryKey: ['admin-withdrawals', 'all', status, offset],
    queryFn: () => listAdminWithdrawals({ status: status ?? undefined, limit: PAGE_SIZE, offset }),
    refetchInterval: 30_000,
  });

  const items = query.data?.items ?? [];

  async function invalidate() {
    await queryClient.invalidateQueries({ queryKey: ['admin-withdrawals'] });
  }

  function confirmApprove(id: string) {
    confirm({
      title: 'Approve this withdrawal?',
      description: 'This submits the withdrawal to the payment provider for real payout.',
      confirmLabel: 'Approve',
      successMessage: 'Withdrawal approved',
      onConfirm: async () => {
        await approveWithdrawal(id);
        await invalidate();
      },
    });
  }

  function confirmReject(id: string) {
    confirm({
      title: 'Reject this withdrawal?',
      description: 'The held funds are released back to the user’s available balance.',
      destructive: true,
      reasonRequired: true,
      confirmLabel: 'Reject',
      successMessage: 'Withdrawal rejected',
      onConfirm: async (reason) => {
        await rejectWithdrawal(id, reason ?? '');
        await invalidate();
      },
    });
  }

  function confirmReverse(id: string) {
    confirm({
      title: 'Reverse this completed withdrawal?',
      description: 'Funds are credited back to the user. Only use this to correct a genuine error — the money has already left the house.',
      destructive: true,
      reasonRequired: true,
      requireTypedConfirmation: 'REVERSE',
      confirmLabel: 'Reverse',
      successMessage: 'Withdrawal reversed',
      onConfirm: async (reason) => {
        await reverseWithdrawal(id, reason ?? '');
        await invalidate();
      },
    });
  }

  function confirmReconcile() {
    confirm({
      title: 'Reconcile all pending withdrawals with the provider?',
      description: 'Independently re-checks every submitted withdrawal against the payment provider and auto-resolves any that have actually settled or failed — a bulk action affecting potentially many users at once.',
      confirmLabel: 'Reconcile',
      onConfirm: async () => {
        const result = await reconcileWithdrawals();
        show({ tone: 'info', title: `Reconciled: ${result.resolved} resolved, ${result.stillPending} still pending, ${result.errors} errors` });
        await invalidate();
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
            setStatus(value as WithdrawalStatus | null);
            setOffset(0);
          }}
        />
        <RequirePermission permission="withdrawals.approve">
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
          <EmptyState icon={Coins} title="No withdrawals match this filter." />
        ) : (
          <ul className="space-y-2">
            {items.map((withdrawal) => (
              <li key={withdrawal.id} className="rounded-2xl border border-neutral-200 bg-white p-3 sm:p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-neutral-900">{formatCurrencyMinorUnits(withdrawal.amountMinorUnits, withdrawal.currency)}</p>
                    <p className="mt-0.5 text-xs text-neutral-500">
                      <Link href={`/users/${withdrawal.userId}?tab=Withdrawals`} className="hover:underline">
                        User {withdrawal.userId.slice(0, 8)}
                      </Link>
                      {' · '}
                      {new Date(withdrawal.createdAt).toLocaleString()}
                      {withdrawal.failureReason ? ` · ${withdrawal.failureReason}` : ''}
                      {withdrawal.rejectionReason ? ` · ${withdrawal.rejectionReason}` : ''}
                    </p>
                  </div>
                  <StatusBadge status={withdrawal.status} styles={WITHDRAWAL_STATUS_STYLES} />
                </div>
                <RequirePermission permission="withdrawals.approve">
                  <div className="mt-3 flex flex-wrap gap-2 border-t border-neutral-100 pt-3">
                    {withdrawal.status === 'pending_review' && (
                      <>
                        <button type="button" onClick={() => confirmApprove(withdrawal.id)} className="rounded-full bg-brand-50 px-3 py-1.5 text-xs font-bold text-brand-600 hover:bg-brand-100">
                          Approve
                        </button>
                        <button type="button" onClick={() => confirmReject(withdrawal.id)} className="rounded-full bg-loss-50 px-3 py-1.5 text-xs font-bold text-loss-500 hover:bg-red-100">
                          Reject
                        </button>
                      </>
                    )}
                    {withdrawal.status === 'completed' && (
                      <button type="button" onClick={() => confirmReverse(withdrawal.id)} className="rounded-full bg-loss-50 px-3 py-1.5 text-xs font-bold text-loss-500 hover:bg-red-100">
                        Reverse
                      </button>
                    )}
                  </div>
                </RequirePermission>
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
