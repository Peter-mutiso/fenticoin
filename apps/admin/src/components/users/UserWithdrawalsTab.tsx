'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Coins } from 'lucide-react';
import { useState } from 'react';

import { approveWithdrawal, listAdminWithdrawals, rejectWithdrawal, reverseWithdrawal } from '@/lib/api-client';
import { describeApiError } from '@/lib/api-errors';
import { formatCurrencyMinorUnits } from '@/lib/money';
import { RequirePermission } from '@/components/auth/RequirePermission';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { Notice } from '@/components/ui/Notice';
import { Pagination } from '@/components/ui/Pagination';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { WITHDRAWAL_STATUS_STYLES } from '@/components/finance/finance-display';
import { useConfirmedAction } from '@/lib/useConfirmedAction';

const PAGE_SIZE = 25;

export function UserWithdrawalsTab({ userId }: { userId: string }) {
  const [offset, setOffset] = useState(0);
  const queryClient = useQueryClient();
  const { confirm, dialogProps } = useConfirmedAction();
  const query = useQuery({
    queryKey: ['admin-withdrawals', userId, offset],
    queryFn: () => listAdminWithdrawals({ userId, limit: PAGE_SIZE, offset }),
  });

  const items = query.data?.items ?? [];

  async function invalidate() {
    await queryClient.invalidateQueries({ queryKey: ['admin-withdrawals', userId] });
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
  if (items.length === 0) return <EmptyState icon={Coins} title="No withdrawals yet." />;

  return (
    <div>
      <ul className="space-y-2">
        {items.map((withdrawal) => (
          <li key={withdrawal.id} className="rounded-2xl border border-neutral-200 bg-white p-3 sm:p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-neutral-900">{formatCurrencyMinorUnits(withdrawal.amountMinorUnits, withdrawal.currency)}</p>
                <p className="mt-0.5 text-xs text-neutral-500">
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
      <Pagination offset={offset} limit={PAGE_SIZE} itemCount={items.length} onOffsetChange={setOffset} />
      <ConfirmDialog {...dialogProps} />
    </div>
  );
}
