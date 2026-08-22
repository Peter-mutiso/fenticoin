'use client';

import { useQuery } from '@tanstack/react-query';
import { ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import { listUsers, type KycStatus } from '@/lib/api-client';
import { describeApiError } from '@/lib/api-errors';
import { EmptyState } from '@/components/ui/EmptyState';
import { FilterBar } from '@/components/ui/FilterBar';
import { Notice } from '@/components/ui/Notice';
import { Pagination } from '@/components/ui/Pagination';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { KYC_STATUS_STYLES } from '@/components/users/user-display';

const OPTIONS: { value: KycStatus; label: string }[] = [
  { value: 'pending', label: 'Pending' },
  { value: 'unverified', label: 'Unverified' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
];

const PAGE_SIZE = 25;

export function KycQueue() {
  const [status, setStatus] = useState<KycStatus | null>('pending');
  const [offset, setOffset] = useState(0);

  const query = useQuery({
    queryKey: ['users', 'kyc-queue', status, offset],
    queryFn: () => listUsers({ kycStatus: status ?? undefined, limit: PAGE_SIZE, offset }),
  });

  const items = query.data?.items ?? [];

  return (
    <div>
      <FilterBar
        options={OPTIONS}
        value={status}
        onChange={(value) => {
          setStatus(value as KycStatus | null);
          setOffset(0);
        }}
      />

      <div className="mt-4">
        {query.isLoading ? (
          <div className="space-y-2">
            {[0, 1].map((i) => (
              <div key={i} className="h-16 animate-pulse rounded-2xl bg-neutral-100" />
            ))}
          </div>
        ) : query.error ? (
          <Notice text={describeApiError(query.error).title} />
        ) : items.length === 0 ? (
          <EmptyState icon={ShieldCheck} title="No users match this KYC status." />
        ) : (
          <ul className="space-y-2">
            {items.map((user) => (
              <li key={user.id}>
                <Link href={`/users/${user.id}`} className="flex items-center justify-between gap-3 rounded-2xl border border-neutral-200 bg-white p-4 transition hover:border-neutral-300">
                  <div>
                    <p className="text-sm font-semibold text-neutral-900">{user.email}</p>
                    <p className="mt-0.5 text-xs text-neutral-500">Joined {new Date(user.createdAt).toLocaleDateString()}</p>
                  </div>
                  <StatusBadge status={user.kycStatus} styles={KYC_STATUS_STYLES} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Pagination offset={offset} limit={PAGE_SIZE} itemCount={items.length} onOffsetChange={setOffset} />
    </div>
  );
}
