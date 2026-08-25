'use client';

import { useQuery } from '@tanstack/react-query';
import { Search, Users as UsersIcon } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import { listUsers, type AccountStatus, type KycStatus } from '@/lib/api-client';
import { describeApiError } from '@/lib/api-errors';
import { EmptyState } from '@/components/ui/EmptyState';
import { FilterBar } from '@/components/ui/FilterBar';
import { Notice } from '@/components/ui/Notice';
import { Pagination } from '@/components/ui/Pagination';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { ACCOUNT_STATUS_STYLES, KYC_STATUS_STYLES } from './user-display';

const STATUS_OPTIONS: { value: AccountStatus; label: string }[] = [
  { value: 'active', label: 'Active' },
  { value: 'suspended', label: 'Suspended' },
  { value: 'banned', label: 'Banned' },
  { value: 'pending_deletion', label: 'Pending deletion' },
];

const KYC_OPTIONS: { value: KycStatus; label: string }[] = [
  { value: 'unverified', label: 'Unverified' },
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
];

const PAGE_SIZE = 25;

export function UsersList() {
  const [emailInput, setEmailInput] = useState('');
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<AccountStatus | null>(null);
  const [kycStatus, setKycStatus] = useState<KycStatus | null>(null);
  const [offset, setOffset] = useState(0);

  const usersQuery = useQuery({
    queryKey: ['users', email, status, kycStatus, offset],
    queryFn: () => listUsers({ email: email || undefined, status: status ?? undefined, kycStatus: kycStatus ?? undefined, limit: PAGE_SIZE, offset }),
  });

  function handleSearchSubmit(event: React.FormEvent) {
    event.preventDefault();
    setEmail(emailInput.trim());
    setOffset(0);
  }

  const users = usersQuery.data?.items ?? [];

  return (
    <div>
      <form onSubmit={handleSearchSubmit} className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" aria-hidden="true" />
        <input
          type="search"
          value={emailInput}
          onChange={(event) => setEmailInput(event.target.value)}
          placeholder="Search by email…"
          aria-label="Search by email"
          className="w-full rounded-xl border border-neutral-200 bg-white py-3 pl-10 pr-3 text-sm outline-none focus:ring-2 focus:ring-brand-500"
        />
      </form>

      <div className="mt-4 space-y-3">
        <div>
          <p className="mb-1.5 text-xs font-semibold text-neutral-500">Account status</p>
          <FilterBar
            options={STATUS_OPTIONS}
            value={status}
            onChange={(value) => {
              setStatus(value as AccountStatus | null);
              setOffset(0);
            }}
          />
        </div>
        <div>
          <p className="mb-1.5 text-xs font-semibold text-neutral-500">KYC status</p>
          <FilterBar
            options={KYC_OPTIONS}
            value={kycStatus}
            onChange={(value) => {
              setKycStatus(value as KycStatus | null);
              setOffset(0);
            }}
          />
        </div>
      </div>

      <div className="mt-5">
        {usersQuery.isLoading ? (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-16 animate-pulse rounded-2xl bg-neutral-100" />
            ))}
          </div>
        ) : usersQuery.error ? (
          <Notice text={describeApiError(usersQuery.error).title} />
        ) : users.length === 0 ? (
          <EmptyState icon={UsersIcon} title={email || status || kycStatus ? 'No users match these filters.' : 'No users yet.'} />
        ) : (
          <ul className="space-y-2">
            {users.map((user) => (
              <li key={user.id}>
                <Link
                  href={`/users/${user.id}`}
                  className="flex items-center justify-between gap-3 rounded-2xl border border-neutral-200 bg-white p-4 transition hover:border-neutral-300"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-neutral-900">{user.email}</p>
                    <p className="mt-0.5 text-xs text-neutral-500">Joined {new Date(user.createdAt).toLocaleDateString()}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <StatusBadge status={user.kycStatus} styles={KYC_STATUS_STYLES} />
                    <StatusBadge status={user.status} styles={ACCOUNT_STATUS_STYLES} />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Pagination offset={offset} limit={PAGE_SIZE} itemCount={users.length} onOffsetChange={setOffset} />
    </div>
  );
}
