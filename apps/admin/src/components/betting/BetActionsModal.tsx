'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { X } from 'lucide-react';

import { cancelBet, disputeBet, getAdminBet, getBetSettlementAudit, resolveDispute, resolveManualReview, settleBet } from '@/lib/api-client';
import { describeApiError } from '@/lib/api-errors';
import { formatCurrencyMinorUnits } from '@/lib/money';
import { RequirePermission } from '@/components/auth/RequirePermission';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Notice } from '@/components/ui/Notice';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { BET_STATUS_STYLES } from '@/components/finance/finance-display';
import { useConfirmedAction } from '@/lib/useConfirmedAction';

export function BetActionsModal({ betId, onClose }: { betId: string; onClose: () => void }) {
  const queryClient = useQueryClient();
  const { confirm, dialogProps } = useConfirmedAction();

  const betQuery = useQuery({ queryKey: ['admin-bet', betId], queryFn: () => getAdminBet(betId) });
  const auditQuery = useQuery({ queryKey: ['bet-settlement-audit', betId], queryFn: () => getBetSettlementAudit(betId) });

  async function invalidate() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['admin-bet', betId] }),
      queryClient.invalidateQueries({ queryKey: ['admin-bets'] }),
    ]);
  }

  function confirmCancel() {
    confirm({
      title: 'Cancel this bet?',
      description: 'The stake is refunded to the user.',
      destructive: true,
      reasonRequired: true,
      confirmLabel: 'Cancel bet',
      successMessage: 'Bet cancelled',
      onConfirm: async (reason) => {
        await cancelBet(betId, reason ?? '');
        await invalidate();
      },
    });
  }

  function confirmDispute() {
    confirm({
      title: 'Flag this bet as disputed?',
      description: 'Marks the bet for manual review of its settlement outcome.',
      reasonRequired: true,
      confirmLabel: 'Flag disputed',
      successMessage: 'Bet flagged as disputed',
      onConfirm: async (reason) => {
        await disputeBet(betId, reason ?? '');
        await invalidate();
      },
    });
  }

  function confirmResolveDispute(resolution: 'uphold' | 'reverse') {
    confirm({
      title: resolution === 'uphold' ? 'Uphold the original settlement?' : 'Reverse the settlement?',
      description: resolution === 'reverse' ? 'This reverses the original win/loss outcome — the affected ledger movement is corrected accordingly.' : 'The original outcome stands.',
      destructive: resolution === 'reverse',
      reasonRequired: true,
      confirmLabel: 'Confirm',
      successMessage: 'Dispute resolved',
      onConfirm: async (reason) => {
        await resolveDispute(betId, resolution, reason ?? '');
        await invalidate();
      },
    });
  }

  function confirmSettle() {
    confirm({
      title: 'Trigger settlement now?',
      description: 'Manually runs settlement for this bet immediately, using the current market price.',
      confirmLabel: 'Settle',
      successMessage: 'Settlement triggered',
      onConfirm: async () => {
        await settleBet(betId);
        await invalidate();
      },
    });
  }

  function confirmResolveReview(resolution: 'win' | 'loss' | 'void') {
    confirm({
      title: `Resolve as "${resolution}"?`,
      description: 'This bet required manual review after repeated automated settlement failures — this records the final human determination.',
      destructive: resolution !== 'void',
      reasonRequired: true,
      confirmLabel: 'Resolve',
      successMessage: 'Review resolved',
      onConfirm: async (reason) => {
        await resolveManualReview(betId, resolution, reason ?? '');
        await invalidate();
      },
    });
  }

  const bet = betQuery.data;

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-navy-950/50 p-0 sm:items-center sm:justify-center sm:p-4" role="dialog" aria-modal="true" aria-label="Bet details">
      <div className="max-h-[90vh] w-full overflow-y-auto rounded-t-3xl bg-white p-6 shadow-xl sm:max-w-lg sm:rounded-3xl">
        <div className="flex items-start justify-between">
          <h2 className="text-xl font-bold">Bet details</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="text-neutral-400 hover:text-neutral-600">
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        {betQuery.isLoading && <div className="mt-4 h-32 animate-pulse rounded-2xl bg-neutral-100" />}
        {betQuery.error && <Notice text={describeApiError(betQuery.error).title} className="mt-4" />}

        {bet && (
          <div className="mt-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-neutral-900">
                {bet.type.replace('_', '/')} · {bet.selection}
              </p>
              <StatusBadge status={bet.status} styles={BET_STATUS_STYLES} />
            </div>

            <dl className="mt-4 space-y-2 text-sm">
              <Row label="User" value={bet.userId} />
              <Row label="Stake" value={formatCurrencyMinorUnits(bet.stakeAmountMinorUnits, bet.currency)} />
              <Row label="Potential payout" value={formatCurrencyMinorUnits(bet.potentialPayoutMinorUnits, bet.currency)} />
              <Row label="Placed" value={new Date(bet.placedAt).toLocaleString()} />
              <Row label="Expires" value={new Date(bet.expiresAt).toLocaleString()} />
              {bet.settledAt && <Row label="Settled" value={new Date(bet.settledAt).toLocaleString()} />}
              {bet.cancelReason && <Row label="Reason" value={bet.cancelReason} />}
            </dl>

            {auditQuery.data && auditQuery.data.items.length > 0 && (
              <div className="mt-4 border-t border-neutral-100 pt-4">
                <p className="text-xs font-bold uppercase tracking-wide text-neutral-500">Settlement attempts</p>
                <ul className="mt-2 space-y-1.5">
                  {auditQuery.data.items.map((attempt) => (
                    <li key={attempt.id} className="rounded-lg bg-neutral-50 p-2 text-xs">
                      <span className="font-semibold">{attempt.outcome}</span> · {new Date(attempt.attemptedAt).toLocaleString()}
                      {attempt.errorMessage ? ` · ${attempt.errorMessage}` : ''}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <RequirePermission permission="bets.settle">
              <div className="mt-5 flex flex-wrap gap-2 border-t border-neutral-100 pt-4">
                {(bet.status === 'open' || bet.status === 'pending') && (
                  <>
                    <button type="button" onClick={confirmCancel} className="rounded-full bg-loss-50 px-3 py-1.5 text-xs font-bold text-loss-500 hover:bg-red-100">
                      Cancel
                    </button>
                    <button type="button" onClick={confirmSettle} className="rounded-full bg-brand-50 px-3 py-1.5 text-xs font-bold text-brand-600 hover:bg-brand-100">
                      Settle now
                    </button>
                  </>
                )}
                {(bet.status === 'won' || bet.status === 'lost') && (
                  <button type="button" onClick={confirmDispute} className="rounded-full bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-700 hover:bg-amber-100">
                    Flag disputed
                  </button>
                )}
                {bet.status === 'disputed' && (
                  <>
                    <button type="button" onClick={() => confirmResolveDispute('uphold')} className="rounded-full bg-brand-50 px-3 py-1.5 text-xs font-bold text-brand-600 hover:bg-brand-100">
                      Uphold
                    </button>
                    <button type="button" onClick={() => confirmResolveDispute('reverse')} className="rounded-full bg-loss-50 px-3 py-1.5 text-xs font-bold text-loss-500 hover:bg-red-100">
                      Reverse
                    </button>
                  </>
                )}
                {bet.status === 'requires_review' && (
                  <>
                    <button type="button" onClick={() => confirmResolveReview('win')} className="rounded-full bg-brand-50 px-3 py-1.5 text-xs font-bold text-brand-600 hover:bg-brand-100">
                      Resolve: win
                    </button>
                    <button type="button" onClick={() => confirmResolveReview('loss')} className="rounded-full bg-loss-50 px-3 py-1.5 text-xs font-bold text-loss-500 hover:bg-red-100">
                      Resolve: loss
                    </button>
                    <button type="button" onClick={() => confirmResolveReview('void')} className="rounded-full bg-neutral-100 px-3 py-1.5 text-xs font-bold text-neutral-700 hover:bg-neutral-200">
                      Resolve: void
                    </button>
                  </>
                )}
              </div>
            </RequirePermission>
          </div>
        )}
      </div>
      <ConfirmDialog {...dialogProps} />
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
