'use client';

import { useQuery } from '@tanstack/react-query';
import { AlertOctagon } from 'lucide-react';
import { useState } from 'react';

import { listBetsRequiringReview } from '@/lib/api-client';
import { describeApiError } from '@/lib/api-errors';
import { formatCurrencyMinorUnits } from '@/lib/money';
import { EmptyState } from '@/components/ui/EmptyState';
import { Notice } from '@/components/ui/Notice';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { BET_STATUS_STYLES } from '@/components/finance/finance-display';
import { BetActionsModal } from './BetActionsModal';

export function RiskQueue() {
  const [openBetId, setOpenBetId] = useState<string | null>(null);
  // 30s polling fallback — this view also gets pushed updates via the
  // real-time layer (RealtimeProvider invalidates ['bets-requiring-review']
  // on bet.updated/bet.settled), but apps/admin has no other polling
  // anywhere, so this is what keeps the queue current if the socket is
  // ever unavailable.
  const query = useQuery({ queryKey: ['bets-requiring-review'], queryFn: listBetsRequiringReview, refetchInterval: 30_000 });

  if (query.isLoading) return <div className="h-24 animate-pulse rounded-2xl bg-neutral-100" />;
  if (query.error) return <Notice text={describeApiError(query.error).title} />;

  const items = query.data!.items;
  if (items.length === 0) return <EmptyState icon={AlertOctagon} title="No bets currently need manual review." />;

  return (
    <div>
      <ul className="space-y-2">
        {items.map((bet) => (
          <li key={bet.id}>
            <button type="button" onClick={() => setOpenBetId(bet.id)} className="flex w-full items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50/40 p-3 text-left transition hover:border-amber-300 sm:p-4">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-neutral-900">
                  {bet.type.replace('_', '/')} · {bet.selection} · {formatCurrencyMinorUnits(bet.stakeAmountMinorUnits, bet.currency)}
                </p>
                <p className="mt-0.5 text-xs text-neutral-500">
                  User {bet.userId.slice(0, 8)} · placed {new Date(bet.placedAt).toLocaleString()}
                </p>
              </div>
              <StatusBadge status={bet.status} styles={BET_STATUS_STYLES} />
            </button>
          </li>
        ))}
      </ul>

      {openBetId && <BetActionsModal betId={openBetId} onClose={() => setOpenBetId(null)} />}
    </div>
  );
}
