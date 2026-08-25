'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, ArrowDownToLine } from 'lucide-react';
import Link from 'next/link';
import { useRef, useState } from 'react';

import { createDeposit, listDeposits } from '@/lib/api-client';
import { describeApiError, isProviderNotConfiguredError } from '@/lib/api-errors';
import { useAuth } from '@/lib/auth/AuthContext';
import { formatCurrencyMinorUnits, parseStakeToMinorUnits } from '@/lib/money';
import { EmptyState } from '@/components/ui/EmptyState';
import { Notice } from '@/components/ui/Notice';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useToast } from '@/components/ui/Toast';
import { DEPOSIT_STATUS_STYLES } from './payment-display';

export function DepositForm() {
  const { status: authStatus } = useAuth();
  const { show } = useToast();
  const queryClient = useQueryClient();

  const [amount, setAmount] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<{ title: string; providerUnavailable: boolean } | null>(null);
  const idempotencyKey = useRef<string | null>(null);

  const depositsQuery = useQuery({
    queryKey: ['deposits', 'recent'],
    queryFn: () => listDeposits({ limit: 10 }),
    enabled: authStatus === 'authenticated',
  });

  let minorAmount: bigint | null = null;
  try {
    minorAmount = amount.trim() ? parseStakeToMinorUnits(amount, 'USD') : null;
  } catch {
    minorAmount = null;
  }
  const canSubmit = authStatus === 'authenticated' && minorAmount !== null && minorAmount > 0n && !submitting;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!canSubmit || minorAmount === null) return;
    setSubmitting(true);
    setError(null);

    try {
      idempotencyKey.current ??= crypto.randomUUID();
      await createDeposit({ currency: 'USD', amountMinorUnits: minorAmount.toString() }, idempotencyKey.current);
      idempotencyKey.current = null;
      setAmount('');
      show({ tone: 'success', title: 'Deposit initiated', description: 'Check the status below once the payment provider confirms it.' });
      await queryClient.invalidateQueries({ queryKey: ['deposits'] });
    } catch (thrown) {
      if (isProviderNotConfiguredError(thrown)) {
        setError({ title: "Deposits aren't available yet — the payment provider isn't configured.", providerUnavailable: true });
      } else {
        setError({ title: describeApiError(thrown).title, providerUnavailable: false });
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (authStatus === 'unauthenticated') {
    return (
      <div className="flex items-center justify-between gap-3 rounded-2xl border border-brand-500/30 bg-brand-50 p-4">
        <p className="text-sm font-semibold text-brand-700">Log in to make a deposit.</p>
        <Link href="/login" className="shrink-0 rounded-full bg-brand-500 px-4 py-2 text-sm font-bold text-white transition hover:bg-brand-600">
          Log in
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <form onSubmit={handleSubmit} className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm sm:p-5">
        <label className="block text-sm font-semibold">
          Amount <span className="font-normal text-neutral-500">(USD)</span>
          <input
            inputMode="decimal"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            placeholder="0.00"
            className="mt-2 w-full rounded-xl border border-neutral-200 px-3 py-3 text-lg font-bold outline-none focus:ring-2 focus:ring-brand-500"
          />
        </label>

        {error && <Notice text={error.title} className="mt-3" />}

        <button
          type="submit"
          disabled={!canSubmit}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-brand-500 px-4 py-3 font-bold text-white transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:bg-neutral-200 disabled:text-neutral-400"
        >
          <ArrowDownToLine className="h-4 w-4" aria-hidden="true" />
          {submitting ? 'Submitting…' : 'Deposit'}
        </button>
      </form>

      <section aria-labelledby="recent-deposits-heading">
        <h2 id="recent-deposits-heading" className="text-sm font-bold text-neutral-900">
          Recent deposits
        </h2>
        <div className="mt-3">
          {depositsQuery.isLoading ? (
            <div className="h-14 animate-pulse rounded-2xl bg-neutral-100" />
          ) : depositsQuery.error ? (
            <Notice text={describeApiError(depositsQuery.error).title} />
          ) : (depositsQuery.data?.items.length ?? 0) === 0 ? (
            <EmptyState icon={AlertCircle} title="No deposits yet." />
          ) : (
            <ul className="space-y-2">
              {depositsQuery.data!.items.map((deposit) => (
                <li key={deposit.id} className="flex items-center justify-between gap-3 rounded-2xl border border-neutral-200 bg-white p-3">
                  <div>
                    <p className="text-sm font-semibold text-neutral-900">{formatCurrencyMinorUnits(deposit.amountMinorUnits, deposit.currency)}</p>
                    <p className="mt-0.5 text-xs text-neutral-500">{new Date(deposit.createdAt).toLocaleString()}</p>
                  </div>
                  <StatusBadge status={deposit.status} styles={DEPOSIT_STATUS_STYLES} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
