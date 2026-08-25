'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import {
  getUser,
  getUserRoles,
  reviewKyc,
  setEligibility,
  setUserStatus,
  type EligibilityStatus,
} from '@/lib/api-client';
import { describeApiError } from '@/lib/api-errors';
import { RequirePermission } from '@/components/auth/RequirePermission';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Notice } from '@/components/ui/Notice';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useConfirmedAction } from '@/lib/useConfirmedAction';
import { ACCOUNT_STATUS_STYLES, ELIGIBILITY_STATUS_STYLES, KYC_STATUS_STYLES } from './user-display';
import { UserBetsTab } from './UserBetsTab';
import { UserDepositsTab } from './UserDepositsTab';
import { UserRolesTab } from './UserRolesTab';
import { UserTransactionsTab } from './UserTransactionsTab';
import { UserWalletTab } from './UserWalletTab';
import { UserWithdrawalsTab } from './UserWithdrawalsTab';

const TABS = ['Overview', 'Wallet', 'Transactions', 'Deposits', 'Withdrawals', 'Bets', 'Roles'] as const;
type Tab = (typeof TABS)[number];

function isTab(value: string | null): value is Tab {
  return TABS.includes(value as Tab);
}

export function UserDetailView({ userId, initialTab }: { userId: string; initialTab?: string | null }) {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>(isTab(initialTab ?? null) ? (initialTab as Tab) : 'Overview');
  const { confirm, dialogProps } = useConfirmedAction();

  const userQuery = useQuery({ queryKey: ['admin-user', userId], queryFn: () => getUser(userId) });
  const rolesQuery = useQuery({ queryKey: ['admin-user-roles', userId], queryFn: () => getUserRoles(userId) });

  async function invalidateUser() {
    await queryClient.invalidateQueries({ queryKey: ['admin-user', userId] });
  }

  function confirmStatusChange(status: 'active' | 'suspended' | 'banned', destructive: boolean) {
    confirm({
      title: `Set account status to "${status}"?`,
      description: 'This takes effect immediately. A suspend/ban revokes every active session for this account right away.',
      destructive,
      reasonRequired: true,
      confirmLabel: 'Confirm',
      requireTypedConfirmation: status === 'banned' ? 'BAN' : undefined,
      successMessage: `Account status set to ${status}`,
      onConfirm: async (reason) => {
        await setUserStatus(userId, status, reason);
        await invalidateUser();
      },
    });
  }

  function confirmEligibilityChange(status: EligibilityStatus) {
    confirm({
      title: status === 'ineligible' ? 'Restrict betting, deposits & withdrawals?' : 'Restore eligibility?',
      description:
        status === 'ineligible'
          ? 'This blocks the account from placing bets, depositing, and withdrawing — without suspending the account itself.'
          : 'This restores the account’s ability to bet, deposit, and withdraw.',
      destructive: status === 'ineligible',
      reasonRequired: true,
      confirmLabel: 'Confirm',
      successMessage: 'Eligibility updated',
      onConfirm: async (reason) => {
        await setEligibility(userId, status, reason ?? '');
        await invalidateUser();
      },
    });
  }

  function confirmKycDecision(decision: 'approve' | 'reject') {
    confirm({
      title: decision === 'approve' ? 'Approve KYC?' : 'Reject KYC?',
      description: 'This is recorded on the account and in the audit log.',
      destructive: decision === 'reject',
      reasonRequired: true,
      confirmLabel: decision === 'approve' ? 'Approve' : 'Reject',
      successMessage: `KYC ${decision === 'approve' ? 'approved' : 'rejected'}`,
      onConfirm: async (reason) => {
        await reviewKyc(userId, decision, reason ?? '');
        await invalidateUser();
      },
    });
  }

  if (userQuery.isLoading) {
    return (
      <div className="space-y-3">
        <div className="h-8 w-1/3 animate-pulse rounded-lg bg-neutral-100" />
        <div className="h-40 animate-pulse rounded-2xl bg-neutral-100" />
      </div>
    );
  }

  if (userQuery.error) {
    return <Notice text={describeApiError(userQuery.error).title} />;
  }

  const user = userQuery.data;
  if (!user) return null;

  return (
    <div>
      <Link href="/users" className="inline-flex items-center gap-1 text-sm font-semibold text-neutral-500 hover:text-neutral-900">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Back to users
      </Link>

      <div className="mt-3 rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-neutral-900">{user.email}</h1>
            <p className="mt-0.5 text-xs text-neutral-500">
              Joined {new Date(user.createdAt).toLocaleDateString()} · ID {user.id}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <StatusBadge status={user.status} styles={ACCOUNT_STATUS_STYLES} />
            <StatusBadge status={user.kycStatus} styles={KYC_STATUS_STYLES} />
            <StatusBadge status={user.eligibilityStatus} styles={ELIGIBILITY_STATUS_STYLES} />
          </div>
        </div>

        <RequirePermission permission="users.suspend">
          <div className="mt-4 flex flex-wrap gap-2 border-t border-neutral-100 pt-4">
            {user.status !== 'active' && (
              <button type="button" onClick={() => confirmStatusChange('active', false)} className="rounded-full bg-brand-500 px-4 py-2 text-sm font-bold text-white transition hover:bg-brand-600">
                Restore account
              </button>
            )}
            {user.status !== 'suspended' && (
              <button type="button" onClick={() => confirmStatusChange('suspended', true)} className="rounded-full bg-amber-100 px-4 py-2 text-sm font-bold text-amber-800 transition hover:bg-amber-200">
                Suspend account
              </button>
            )}
            {user.status !== 'banned' && (
              <button type="button" onClick={() => confirmStatusChange('banned', true)} className="rounded-full bg-loss-50 px-4 py-2 text-sm font-bold text-loss-500 transition hover:bg-red-100">
                Ban account
              </button>
            )}
            {user.eligibilityStatus !== 'ineligible' ? (
              <button type="button" onClick={() => confirmEligibilityChange('ineligible')} className="rounded-full bg-neutral-100 px-4 py-2 text-sm font-bold text-neutral-700 transition hover:bg-neutral-200">
                Restrict betting/deposits/withdrawals
              </button>
            ) : (
              <button type="button" onClick={() => confirmEligibilityChange('eligible')} className="rounded-full bg-neutral-100 px-4 py-2 text-sm font-bold text-neutral-700 transition hover:bg-neutral-200">
                Remove restriction
              </button>
            )}
          </div>
        </RequirePermission>

        <RequirePermission permission="kyc.review">
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" onClick={() => confirmKycDecision('approve')} className="rounded-full bg-brand-50 px-4 py-2 text-sm font-bold text-brand-600 transition hover:bg-brand-100">
              Approve KYC
            </button>
            <button type="button" onClick={() => confirmKycDecision('reject')} className="rounded-full bg-loss-50 px-4 py-2 text-sm font-bold text-loss-500 transition hover:bg-red-100">
              Reject KYC
            </button>
          </div>
        </RequirePermission>
      </div>

      <div className="mt-5 flex flex-wrap gap-2 border-b border-neutral-200">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`-mb-px rounded-t-lg border-b-2 px-3 py-2 text-sm font-semibold transition ${
              tab === t ? 'border-brand-500 text-brand-600' : 'border-transparent text-neutral-500 hover:text-neutral-900'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="mt-4">
        {tab === 'Overview' && (
          <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm sm:p-5">
            <dl className="space-y-3 text-sm">
              <Row label="Email verified" value={user.emailVerifiedAt ? new Date(user.emailVerifiedAt).toLocaleString() : 'Not verified'} />
              <Row label="Phone" value={user.phone ?? 'Not set'} />
              <Row label="Phone verified" value={user.phoneVerifiedAt ? new Date(user.phoneVerifiedAt).toLocaleString() : 'Not verified'} />
              <Row label="Date of birth" value={user.dateOfBirth ?? 'Not set'} />
              <Row label="Roles" value={rolesQuery.data?.roles.join(', ') || 'None (regular user)'} />
            </dl>
          </div>
        )}
        {tab === 'Wallet' && <UserWalletTab userId={userId} />}
        {tab === 'Transactions' && <UserTransactionsTab userId={userId} />}
        {tab === 'Deposits' && <UserDepositsTab userId={userId} />}
        {tab === 'Withdrawals' && <UserWithdrawalsTab userId={userId} />}
        {tab === 'Bets' && <UserBetsTab userId={userId} />}
        {tab === 'Roles' && <UserRolesTab userId={userId} />}
      </div>

      <ConfirmDialog {...dialogProps} />
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-neutral-500">{label}</dt>
      <dd className="font-semibold text-neutral-900">{value}</dd>
    </div>
  );
}
