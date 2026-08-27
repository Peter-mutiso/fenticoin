import { CheckCircle2, Clock3, MinusCircle, XCircle } from 'lucide-react';

import type { DepositStatus, WithdrawalStatus } from '@/lib/api-client';
import type { StatusStyle } from '@/components/ui/StatusBadge';

export const DEPOSIT_STATUS_STYLES: Record<DepositStatus, StatusStyle> = {
  pending: { label: 'Pending', className: 'bg-neutral-100 text-neutral-700', icon: Clock3 },
  completed: { label: 'Completed', className: 'bg-brand-50 text-brand-700', icon: CheckCircle2 },
  failed: { label: 'Failed', className: 'bg-loss-50 text-loss-700', icon: XCircle },
  cancelled: { label: 'Cancelled', className: 'bg-neutral-100 text-neutral-700', icon: MinusCircle },
  expired: { label: 'Expired', className: 'bg-neutral-100 text-neutral-700', icon: MinusCircle },
};

export const WITHDRAWAL_STATUS_STYLES: Record<WithdrawalStatus, StatusStyle> = {
  pending_review: { label: 'Pending review', className: 'bg-neutral-100 text-neutral-700', icon: Clock3 },
  approved: { label: 'Approved', className: 'bg-amber-50 text-amber-700', icon: Clock3 },
  submitted: { label: 'Submitted', className: 'bg-amber-50 text-amber-700', icon: Clock3 },
  unknown: { label: 'Provider outcome unknown', className: 'bg-amber-50 text-amber-700', icon: Clock3 },
  completed: { label: 'Completed', className: 'bg-brand-50 text-brand-700', icon: CheckCircle2 },
  failed: { label: 'Failed', className: 'bg-loss-50 text-loss-700', icon: XCircle },
  rejected: { label: 'Rejected', className: 'bg-loss-50 text-loss-700', icon: XCircle },
  reversed: { label: 'Reversed', className: 'bg-neutral-100 text-neutral-700', icon: MinusCircle },
};
