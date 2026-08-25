import { AlertCircle, Ban, CheckCircle2, Clock3, ShieldOff, ShieldQuestion, XCircle } from 'lucide-react';

import type { AccountStatus, EligibilityStatus, KycStatus } from '@/lib/api-client';
import type { StatusStyle } from '@/components/ui/StatusBadge';

export const ACCOUNT_STATUS_STYLES: Record<AccountStatus, StatusStyle> = {
  active: { label: 'Active', className: 'bg-brand-50 text-brand-600', icon: CheckCircle2 },
  suspended: { label: 'Suspended', className: 'bg-amber-50 text-amber-700', icon: ShieldOff },
  banned: { label: 'Banned', className: 'bg-loss-50 text-loss-500', icon: Ban },
  pending_deletion: { label: 'Pending deletion', className: 'bg-neutral-100 text-neutral-700', icon: Clock3 },
};

export const KYC_STATUS_STYLES: Record<KycStatus, StatusStyle> = {
  unverified: { label: 'Unverified', className: 'bg-neutral-100 text-neutral-700', icon: ShieldQuestion },
  pending: { label: 'Pending review', className: 'bg-amber-50 text-amber-700', icon: Clock3 },
  approved: { label: 'Approved', className: 'bg-brand-50 text-brand-600', icon: CheckCircle2 },
  rejected: { label: 'Rejected', className: 'bg-loss-50 text-loss-500', icon: XCircle },
};

export const ELIGIBILITY_STATUS_STYLES: Record<EligibilityStatus, StatusStyle> = {
  eligible: { label: 'Eligible', className: 'bg-brand-50 text-brand-600', icon: CheckCircle2 },
  ineligible: { label: 'Restricted', className: 'bg-loss-50 text-loss-500', icon: AlertCircle },
  unknown: { label: 'Unknown', className: 'bg-neutral-100 text-neutral-700', icon: ShieldQuestion },
};
