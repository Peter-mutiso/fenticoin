'use client';

import { useQuery } from '@tanstack/react-query';
import { Receipt } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import { listWalletTransactions } from '@/lib/api-client';
import { describeApiError } from '@/lib/api-errors';
import { useAuth } from '@/lib/auth/AuthContext';
import { formatCurrencyMinorUnits } from '@/lib/money';
import { EmptyState } from '@/components/ui/EmptyState';
import { FilterBar } from '@/components/ui/FilterBar';
import { Notice } from '@/components/ui/Notice';
import { Pagination } from '@/components/ui/Pagination';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { TRANSACTION_GROUP_LABELS, TRANSACTION_STATUS_STYLES, TRANSACTION_TYPE_LABELS, transactionGroup, type TransactionGroup } from './transaction-display';

const GROUP_OPTIONS: { value: TransactionGroup; label: string }[] = (
  ['deposit', 'withdrawal', 'betting', 'bonus', 'adjustment', 'other'] as const
).map((value) => ({ value, label: TRANSACTION_GROUP_LABELS[value] }));

const PAGE_SIZE = 25;

export function TransactionsTable() {
  const { status: authStatus } = useAuth();
  const enabled = authStatus === 'authenticated';

  const [groupFilter, setGroupFilter] = useState<TransactionGroup | null>(null);
  const [offset, setOffset] = useState(0);

  const transactionsQuery = useQuery({
    queryKey: ['wallet-transactions', offset],
    queryFn: () => listWalletTransactions({ limit: PAGE_SIZE, offset }),
    enabled,
  });

  const transactions = transactionsQuery.data?.items ?? [];
  // No server-side type filter exists — applied client-side over the current page only.
  const visible = groupFilter ? transactions.filter((tx) => transactionGroup(tx.type) === groupFilter) : transactions;

  if (authStatus === 'unauthenticated') {
    return (
      <div className="flex items-center justify-between gap-3 rounded-2xl border border-brand-500/30 bg-brand-50 p-4">
        <p className="text-sm font-semibold text-brand-700">Log in to see your transactions.</p>
        <Link href="/login" className="shrink-0 rounded-full bg-brand-500 px-4 py-2 text-sm font-bold text-navy-950 transition hover:bg-brand-600">
          Log in
        </Link>
      </div>
    );
  }

  return (
    <div>
      <FilterBar
        options={GROUP_OPTIONS}
        value={groupFilter}
        onChange={(value) => setGroupFilter(value as TransactionGroup | null)}
      />

      <div className="mt-4">
        {transactionsQuery.isLoading ? (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-14 animate-pulse rounded-2xl bg-neutral-100" />
            ))}
          </div>
        ) : transactionsQuery.error ? (
          <Notice text={describeApiError(transactionsQuery.error).title} />
        ) : visible.length === 0 ? (
          <EmptyState icon={Receipt} title={groupFilter ? 'No transactions match this filter.' : "You don't have any transactions yet."} />
        ) : (
          <ul className="space-y-2">
            {visible.map((tx) => (
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
        )}
      </div>

      <Pagination offset={offset} limit={PAGE_SIZE} itemCount={transactions.length} onOffsetChange={setOffset} />
    </div>
  );
}
