'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, ArrowUpFromLine } from 'lucide-react';
import Link from 'next/link';
import { useRef, useState } from 'react';

import { createWithdrawal, getWallet, listWithdrawals } from '@/lib/api-client';
import { describeApiError, isProviderNotConfiguredError } from '@/lib/api-errors';
import { useAuth } from '@/lib/auth/AuthContext';
import { formatCurrencyMinorUnits, parseStakeToMinorUnits } from '@/lib/money';
import { EmptyState } from '@/components/ui/EmptyState';
import { Notice } from '@/components/ui/Notice';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useToast } from '@/components/ui/Toast';
import { WITHDRAWAL_STATUS_STYLES } from './payment-display';

export function WithdrawalForm() {
  const { status: authStatus, isDemo } = useAuth();
  const { show } = useToast();
  const queryClient = useQueryClient();
  const enabled = authStatus === 'authenticated';

  const [amount, setAmount] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<{ title: string; providerUnavailable: boolean } | null>(null);
  const idempotencyKey = useRef<string | null>(null);

  const walletQuery = useQuery({ queryKey: ['wallet', 'USD'], queryFn: () => getWallet('USD'), enabled });
  const withdrawalsQuery = useQuery({ queryKey: ['withdrawals', 'recent'], queryFn: () => listWithdrawals({ limit: 10 }), enabled });

  let minorAmount: bigint | null = null;
  try {
    minorAmount = amount.trim() ? parseStakeToMinorUnits(amount, 'USD') : null;
  } catch {
    minorAmount = null;
  }
  const available = walletQuery.data ? BigInt(walletQuery.data.availableMinorUnits) : undefined;
  const hasBalance = Boolean(minorAmount !== null && available !== undefined && minorAmount <= available);
  const canSubmit = enabled && minorAmount !== null && minorAmount > 0n && hasBalance && !submitting;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!canSubmit || minorAmount === null) return;
    setSubmitting(true);
    setError(null);

    try {
      idempotencyKey.current ??= crypto.randomUUID();
      await createWithdrawal({ currency: 'USD', amountMinorUnits: minorAmount.toString() }, idempotencyKey.current);
      idempotencyKey.current = null;
      setAmount('');
      show({ tone: 'success', title: 'Withdrawal requested', description: 'Your funds are held pending review.' });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['withdrawals'] }),
        queryClient.invalidateQueries({ queryKey: ['wallet'] }),
      ]);
    } catch (thrown) {
      if (isProviderNotConfiguredError(thrown)) {
        setError({ title: "Withdrawals aren't available yet — the payment provider isn't configured.", providerUnavailable: true });
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
        <p className="text-sm font-semibold text-brand-700">Log in to request a withdrawal.</p>
        <Link href="/login" className="shrink-0 rounded-full bg-brand-500 px-4 py-2 text-sm font-bold text-navy-950 transition hover:bg-brand-600">
          Log in
        </Link>
      </div>
    );
  }

  if (isDemo) {
    return <Notice tone="info" text="Demo accounts use virtual funds. Withdrawals are unavailable in Demo Mode." />;
  }

  return (
    <div className="space-y-6">
      <form onSubmit={handleSubmit} className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm sm:p-5">
        {walletQuery.data && (
          <p className="text-sm text-neutral-500">
            Available: <span className="font-semibold text-neutral-900">{formatCurrencyMinorUnits(walletQuery.data.availableMinorUnits, walletQuery.data.currency)}</span>
          </p>
        )}
        <label className="mt-3 block text-sm font-semibold">
          Amount <span className="font-normal text-neutral-500">(USD)</span>
          <input
            inputMode="decimal"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            placeholder="0.00"
            className="mt-2 w-full rounded-xl border border-neutral-200 px-3 py-3 text-lg font-bold outline-none focus:ring-2 focus:ring-brand-500"
          />
        </label>
        {amount && minorAmount !== null && !hasBalance && <Notice text="Insufficient available balance for this withdrawal." className="mt-3" />}
        {error && <Notice text={error.title} className="mt-3" />}

        <button
          type="submit"
          disabled={!canSubmit}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-brand-500 px-4 py-3 font-bold text-navy-950 transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:bg-neutral-200 disabled:text-neutral-400"
        >
          <ArrowUpFromLine className="h-4 w-4" aria-hidden="true" />
          {submitting ? 'Submitting…' : 'Withdraw'}
        </button>
      </form>

      <section aria-labelledby="recent-withdrawals-heading">
        <h2 id="recent-withdrawals-heading" className="text-sm font-bold text-neutral-900">
          Recent withdrawals
        </h2>
        <div className="mt-3">
          {withdrawalsQuery.isLoading ? (
            <div className="h-14 animate-pulse rounded-2xl bg-neutral-100" />
          ) : withdrawalsQuery.error ? (
            <Notice text={describeApiError(withdrawalsQuery.error).title} />
          ) : (withdrawalsQuery.data?.items.length ?? 0) === 0 ? (
            <EmptyState icon={AlertCircle} title="No withdrawals yet." />
          ) : (
            <ul className="space-y-2">
              {withdrawalsQuery.data!.items.map((withdrawal) => (
                <li key={withdrawal.id} className="flex items-center justify-between gap-3 rounded-2xl border border-neutral-200 bg-white p-3">
                  <div>
                    <p className="text-sm font-semibold text-neutral-900">{formatCurrencyMinorUnits(withdrawal.amountMinorUnits, withdrawal.currency)}</p>
                    <p className="mt-0.5 text-xs text-neutral-500">{new Date(withdrawal.createdAt).toLocaleString()}</p>
                  </div>
                  <StatusBadge status={withdrawal.status} styles={WITHDRAWAL_STATUS_STYLES} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
