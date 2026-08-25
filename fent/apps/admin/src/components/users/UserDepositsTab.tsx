'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Landmark } from 'lucide-react';
import { useState } from 'react';

import { listAdminDeposits, resolveDeposit } from '@/lib/api-client';
import { describeApiError } from '@/lib/api-errors';
import { formatCurrencyMinorUnits } from '@/lib/money';
import { RequirePermission } from '@/components/auth/RequirePermission';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { Notice } from '@/components/ui/Notice';
import { Pagination } from '@/components/ui/Pagination';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { DEPOSIT_STATUS_STYLES } from '@/components/finance/finance-display';
import { useConfirmedAction } from '@/lib/useConfirmedAction';

const PAGE_SIZE = 25;

export function UserDepositsTab({ userId }: { userId: string }) {
  const [offset, setOffset] = useState(0);
  const queryClient = useQueryClient();
  const { confirm, dialogProps } = useConfirmedAction();
  const query = useQuery({
    queryKey: ['admin-deposits', userId, offset],
    queryFn: () => listAdminDeposits({ userId, limit: PAGE_SIZE, offset }),
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
        await queryClient.invalidateQueries({ queryKey: ['admin-deposits', userId] });
      },
    });
  }

  if (query.isLoading) {
    return (
      <div className="space-y-2">
        {[0, 1].map((i) => (
          <div key={i} className="h-16 animate-pulse rounded-2xl bg-neutral-100" />
        ))}
      </div>
    );
  }
  if (query.error) return <Notice text={describeApiError(query.error).title} />;
  if (items.length === 0) return <EmptyState icon={Landmark} title="No deposits yet." />;

  return (
    <div>
      <ul className="space-y-2">
        {items.map((deposit) => (
          <li key={deposit.id} className="rounded-2xl border border-neutral-200 bg-white p-3 sm:p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-neutral-900">{formatCurrencyMinorUnits(deposit.amountMinorUnits, deposit.currency)}</p>
                <p className="mt-0.5 text-xs text-neutral-500">
                  {new Date(deposit.createdAt).toLocaleString()} · {deposit.providerName ?? 'no provider'}
                  {deposit.failureReason ? ` · ${deposit.failureReason}` : ''}
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
      <Pagination offset={offset} limit={PAGE_SIZE} itemCount={items.length} onOffsetChange={setOffset} />
      <ConfirmDialog {...dialogProps} />
    </div>
  );
}
