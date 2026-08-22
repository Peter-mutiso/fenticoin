import { CheckCircle2, Clock3, MinusCircle, RotateCcw, XCircle } from 'lucide-react';

import type { BetStatus, DepositStatus, InstrumentStatus, TransactionStatus, TransactionType, WithdrawalStatus } from '@/lib/api-client';
import type { StatusStyle } from '@/components/ui/StatusBadge';

export const DEPOSIT_STATUS_STYLES: Record<DepositStatus, StatusStyle> = {
  pending: { label: 'Pending', className: 'bg-neutral-100 text-neutral-700', icon: Clock3 },
  completed: { label: 'Completed', className: 'bg-brand-50 text-brand-600', icon: CheckCircle2 },
  failed: { label: 'Failed', className: 'bg-loss-50 text-loss-500', icon: XCircle },
  cancelled: { label: 'Cancelled', className: 'bg-neutral-100 text-neutral-700', icon: MinusCircle },
  expired: { label: 'Expired', className: 'bg-neutral-100 text-neutral-700', icon: MinusCircle },
};

export const WITHDRAWAL_STATUS_STYLES: Record<WithdrawalStatus, StatusStyle> = {
  pending_review: { label: 'Pending review', className: 'bg-neutral-100 text-neutral-700', icon: Clock3 },
  approved: { label: 'Approved', className: 'bg-amber-50 text-amber-700', icon: Clock3 },
  submitted: { label: 'Submitted', className: 'bg-amber-50 text-amber-700', icon: Clock3 },
  completed: { label: 'Completed', className: 'bg-brand-50 text-brand-600', icon: CheckCircle2 },
  failed: { label: 'Failed', className: 'bg-loss-50 text-loss-500', icon: XCircle },
  rejected: { label: 'Rejected', className: 'bg-loss-50 text-loss-500', icon: XCircle },
  reversed: { label: 'Reversed', className: 'bg-neutral-100 text-neutral-700', icon: MinusCircle },
};

export const TRANSACTION_STATUS_STYLES: Record<TransactionStatus, StatusStyle> = {
  pending: { label: 'Pending', className: 'bg-neutral-100 text-neutral-700', icon: Clock3 },
  posted: { label: 'Posted', className: 'bg-brand-50 text-brand-600', icon: CheckCircle2 },
  failed: { label: 'Failed', className: 'bg-loss-50 text-loss-500', icon: XCircle },
  reversed: { label: 'Reversed', className: 'bg-amber-50 text-amber-700', icon: RotateCcw },
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

export const BET_STATUS_STYLES: Record<BetStatus, StatusStyle> = {
  open: { label: 'Active', className: 'bg-neutral-100 text-neutral-700', icon: Clock3 },
  pending: { label: 'Settling…', className: 'bg-neutral-100 text-neutral-700', icon: Clock3 },
  requires_review: { label: 'Under review', className: 'bg-amber-50 text-amber-700', icon: Clock3 },
  won: { label: 'Won', className: 'bg-brand-50 text-brand-600', icon: CheckCircle2 },
  lost: { label: 'Lost', className: 'bg-loss-50 text-loss-500', icon: XCircle },
  void: { label: 'Void', className: 'bg-neutral-100 text-neutral-700', icon: MinusCircle },
  refunded: { label: 'Refunded', className: 'bg-neutral-100 text-neutral-700', icon: MinusCircle },
  cancelled: { label: 'Cancelled', className: 'bg-neutral-100 text-neutral-700', icon: MinusCircle },
  disputed: { label: 'Disputed', className: 'bg-amber-50 text-amber-700', icon: Clock3 },
};

export const INSTRUMENT_STATUS_STYLES: Record<InstrumentStatus, StatusStyle> = {
  active: { label: 'Active', className: 'bg-brand-50 text-brand-600', icon: CheckCircle2 },
  suspended: { label: 'Suspended', className: 'bg-amber-50 text-amber-700', icon: MinusCircle },
  delisted: { label: 'Delisted', className: 'bg-neutral-100 text-neutral-500', icon: XCircle },
};
