import { CheckCircle2, Clock3, RotateCcw, XCircle } from 'lucide-react';

import type { TransactionStatus, TransactionType } from '@/lib/api-client';
import type { StatusStyle } from '@/components/ui/StatusBadge';

export type TransactionGroup = 'deposit' | 'withdrawal' | 'betting' | 'bonus' | 'adjustment' | 'other';

/** Groups the backend's fine-grained transaction types into the buckets the Transactions page filters by — there is no server-side type filter, so this runs client-side over the fetched page. */
export function transactionGroup(type: TransactionType): TransactionGroup {
  if (type === 'deposit') return 'deposit';
  if (type === 'withdrawal' || type.startsWith('withdrawal_')) return 'withdrawal';
  if (type.startsWith('bet_')) return 'betting';
  if (type === 'bonus') return 'bonus';
  if (type === 'adjustment') return 'adjustment';
  return 'other';
}

export const TRANSACTION_GROUP_LABELS: Record<TransactionGroup, string> = {
  deposit: 'Deposits',
  withdrawal: 'Withdrawals',
  betting: 'Betting',
  bonus: 'Bonuses',
  adjustment: 'Adjustments',
  other: 'Other',
};

export const TRANSACTION_TYPE_LABELS: Record<TransactionType, string> = {
  deposit: 'Deposit',
  withdrawal: 'Withdrawal',
  bet_placement: 'Bet placed',
  bet_refund: 'Bet refunded',
  bet_win: 'Bet won',
  bet_loss: 'Bet lost',
  bonus: 'Bonus',
  adjustment: 'Adjustment',
  fee: 'Fee',
  reversal: 'Reversal',
  withdrawal_hold: 'Withdrawal hold',
  withdrawal_release: 'Withdrawal released',
  withdrawal_settlement: 'Withdrawal settled',
};

export const TRANSACTION_STATUS_STYLES: Record<TransactionStatus, StatusStyle> = {
  pending: { label: 'Pending', className: 'bg-neutral-100 text-neutral-700', icon: Clock3 },
  posted: { label: 'Posted', className: 'bg-brand-50 text-brand-700', icon: CheckCircle2 },
  failed: { label: 'Failed', className: 'bg-loss-50 text-loss-700', icon: XCircle },
  reversed: { label: 'Reversed', className: 'bg-amber-50 text-amber-700', icon: RotateCcw },
};
