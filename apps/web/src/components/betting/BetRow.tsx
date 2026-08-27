import { CheckCircle2, Clock3, HelpCircle, MinusCircle, XCircle } from 'lucide-react';

import type { Bet, BetStatus, Instrument } from '@/lib/api-client';
import { isSettledBetStatus } from '@/lib/api-client';
import { formatCurrencyMinorUnits } from '@/lib/money';
import { StatusBadge, type StatusStyle } from '@/components/ui/StatusBadge';

export const BET_STATUS_STYLES: Record<BetStatus, StatusStyle> = {
  open: { label: 'Active', className: 'bg-neutral-100 text-neutral-700', icon: Clock3 },
  pending: { label: 'Settling…', className: 'bg-neutral-100 text-neutral-700', icon: Clock3 },
  requires_review: { label: 'Under review', className: 'bg-amber-50 text-amber-700', icon: HelpCircle },
  won: { label: 'Won', className: 'bg-brand-50 text-brand-700', icon: CheckCircle2 },
  lost: { label: 'Lost', className: 'bg-loss-50 text-loss-700', icon: XCircle },
  void: { label: 'Void — refunded', className: 'bg-neutral-100 text-neutral-700', icon: MinusCircle },
  refunded: { label: 'Refunded', className: 'bg-neutral-100 text-neutral-700', icon: MinusCircle },
  cancelled: { label: 'Cancelled', className: 'bg-neutral-100 text-neutral-700', icon: MinusCircle },
  disputed: { label: 'Disputed', className: 'bg-amber-50 text-amber-700', icon: HelpCircle },
};

export function betLabel(bet: Bet, instrument?: Instrument): string {
  const symbol = instrument?.displaySymbol ?? bet.instrumentId.slice(0, 8);
  const typeLabel = bet.type.replace('_', '/');
  return `${symbol} · ${typeLabel} · ${bet.selection}`;
}

/** A single bet row — shared by the home page's recent-bets panel, Portfolio, and Bet History. */
export function BetRow({ bet, instrument, onClick }: { bet: Bet; instrument?: Instrument; onClick?: () => void }) {
  const isExpiredButOpen = bet.status === 'open' && new Date(bet.expiresAt).getTime() <= Date.now();
  const Wrapper = onClick ? 'button' : 'div';

  return (
    <li className="rounded-2xl border border-neutral-200 bg-white p-3 sm:p-4">
      <Wrapper
        type={onClick ? 'button' : undefined}
        onClick={onClick}
        className={`flex w-full items-center justify-between gap-3 text-left ${onClick ? 'cursor-pointer' : ''}`}
      >
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-neutral-900">{betLabel(bet, instrument)}</p>
          <p className="mt-0.5 text-xs text-neutral-500">
            Stake {formatCurrencyMinorUnits(bet.stakeAmountMinorUnits, bet.currency)}
            {isSettledBetStatus(bet.status) && bet.result === 'win'
              ? ` · Paid ${formatCurrencyMinorUnits(bet.potentialPayoutMinorUnits, bet.currency)}`
              : ''}
          </p>
        </div>
        <StatusBadge
          status={isExpiredButOpen ? 'pending' : bet.status}
          styles={BET_STATUS_STYLES}
        />
      </Wrapper>
    </li>
  );
}
