'use client';

import { useQuery } from '@tanstack/react-query';
import { Receipt } from 'lucide-react';
import { useState } from 'react';

import { listWalletTransactions } from '@/lib/api-client';
import { describeApiError } from '@/lib/api-errors';
import { formatCurrencyMinorUnits } from '@/lib/money';
import { EmptyState } from '@/components/ui/EmptyState';
import { Notice } from '@/components/ui/Notice';
import { Pagination } from '@/components/ui/Pagination';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { TRANSACTION_STATUS_STYLES, TRANSACTION_TYPE_LABELS } from '@/components/finance/finance-display';

const PAGE_SIZE = 25;

export function UserTransactionsTab({ userId }: { userId: string }) {
  const [offset, setOffset] = useState(0);
  const query = useQuery({
    queryKey: ['wallet-transactions', userId, offset],
    queryFn: () => listWalletTransactions(userId, { limit: PAGE_SIZE, offset }),
  });

  const items = query.data?.items ?? [];

  if (query.isLoading) {
    return (
      <div className="space-y-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-14 animate-pulse rounded-2xl bg-neutral-100" />
        ))}
      </div>
    );
  }
  if (query.error) return <Notice text={describeApiError(query.error).title} />;
  if (items.length === 0) return <EmptyState icon={Receipt} title="No transactions yet." />;

  return (
    <div>
      <ul className="space-y-2">
        {items.map((tx) => (
          <li key={tx.id} className="flex items-center justify-between gap-3 rounded-2xl border border-neutral-200 bg-white p-3 sm:p-4">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-neutral-900">{TRANSACTION_TYPE_LABELS[tx.type]}</p>
              <p className="mt-0.5 text-xs text-neutral-500">
                {new Date(tx.createdAt).toLocaleString()}
                {tx.reason ? ` · ${tx.reason}` : ''}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-3">
              <span className="text-sm font-bold text-neutral-900">{formatCurrencyMinorUnits(tx.totalAmountMinorUnits, tx.currency)}</span>
              <StatusBadge status={tx.status} styles={TRANSACTION_STATUS_STYLES} />
            </div>
          </li>
        ))}
      </ul>
      <Pagination offset={offset} limit={PAGE_SIZE} itemCount={items.length} onOffsetChange={setOffset} />
    </div>
  );
}
