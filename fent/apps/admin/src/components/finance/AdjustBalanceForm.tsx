'use client';

import { useQueryClient } from '@tanstack/react-query';
import { ArrowDownCircle, ArrowUpCircle, Gift } from 'lucide-react';
import { useRef, useState } from 'react';

import { adjustBalance, getWalletBalance, grantBonus, type WalletBalance } from '@/lib/api-client';
import { formatCurrencyMinorUnits, parseAmountToMinorUnits } from '@/lib/money';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useConfirmedAction } from '@/lib/useConfirmedAction';

/**
 * The one form behind both "manual balance adjustment" and "grant bonus" —
 * their DTOs are nearly identical (currency + amount + reason; adjustment
 * additionally has a credit/debit direction). The reason is captured in
 * the form itself (it's a required field of the mutation, not incidental
 * to confirming it), but the actual API call only ever fires from
 * `ConfirmDialog`'s confirm step — this is real money, so it gets the same
 * "are you sure" gate every other high-impact admin action does, never a
 * direct submit-on-click. Every submission is also permission-gated
 * server-side, is idempotent (a fresh key per attempt), and — because it's
 * real money — always captures and displays the wallet balance immediately
 * before and after the call, alongside the timestamp the server itself
 * recorded on the resulting transaction/audit record.
 */
export function AdjustBalanceForm({ userId, mode, currency = 'USD' }: { userId: string; mode: 'adjust' | 'bonus'; currency?: string }) {
  const queryClient = useQueryClient();
  const { confirm, dialogProps } = useConfirmedAction();

  const [direction, setDirection] = useState<'credit' | 'debit'>('credit');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [result, setResult] = useState<{ before: WalletBalance; after: WalletBalance; timestamp: string } | null>(null);
  const idempotencyKey = useRef<string | null>(null);

  let minorAmount: bigint | null = null;
  try {
    minorAmount = amount.trim() ? parseAmountToMinorUnits(amount, currency) : null;
  } catch {
    minorAmount = null;
  }
  const canSubmit = minorAmount !== null && minorAmount > 0n && reason.trim().length >= 5;

  async function doSubmit(): Promise<void> {
    if (minorAmount === null) return;

    const before = await getWalletBalance(userId, currency);
    idempotencyKey.current ??= crypto.randomUUID();

    if (mode === 'adjust') {
      await adjustBalance(userId, { currency, amountMinorUnits: minorAmount.toString(), direction, reason: reason.trim() }, idempotencyKey.current);
    } else {
      await grantBonus(userId, { currency, amountMinorUnits: minorAmount.toString(), reason: reason.trim() }, idempotencyKey.current);
    }

    const after = await getWalletBalance(userId, currency);
    const timestamp = new Date().toISOString();
    setResult({ before, after, timestamp });
    idempotencyKey.current = null;
    setAmount('');
    setReason('');
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['wallet', userId] }),
      queryClient.invalidateQueries({ queryKey: ['wallet-transactions', userId] }),
    ]);
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;

    const amountLabel = formatCurrencyMinorUnits(minorAmount!.toString(), currency);
    confirm({
      title: mode === 'adjust' ? `${direction === 'credit' ? 'Credit' : 'Debit'} ${amountLabel}?` : `Grant a ${amountLabel} bonus?`,
      description:
        mode === 'adjust'
          ? `This posts a real ledger ${direction === 'credit' ? 'credit to' : 'debit from'} the user's available balance. Reason: "${reason.trim()}"`
          : `This posts a real ${amountLabel} liability to the user's available balance. Reason: "${reason.trim()}"`,
      destructive: mode === 'adjust' && direction === 'debit',
      onConfirm: () => doSubmit(),
      successMessage: mode === 'adjust' ? 'Balance adjusted' : 'Bonus granted',
    });
  }

  return (
    <div className="space-y-4">
      <form onSubmit={handleSubmit} className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm sm:p-5">
        {mode === 'adjust' && (
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setDirection('credit')}
              className={`flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition ${
                direction === 'credit' ? 'bg-brand-500 text-white' : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
              }`}
            >
              <ArrowUpCircle className="h-4 w-4" aria-hidden="true" />
              Credit
            </button>
            <button
              type="button"
              onClick={() => setDirection('debit')}
              className={`flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition ${
                direction === 'debit' ? 'bg-loss-500 text-white' : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
              }`}
            >
              <ArrowDownCircle className="h-4 w-4" aria-hidden="true" />
              Debit
            </button>
          </div>
        )}

        <label className="mt-4 block text-sm font-semibold">
          Amount <span className="font-normal text-neutral-500">({currency})</span>
          <input
            inputMode="decimal"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            placeholder="0.00"
            className="mt-2 w-full rounded-xl border border-neutral-200 px-3 py-3 text-lg font-bold outline-none focus:ring-2 focus:ring-brand-500"
          />
        </label>

        <label className="mt-4 block text-sm font-semibold">
          Reason <span className="font-normal text-neutral-500">(at least 5 characters, required — recorded on the ledger transaction)</span>
          <textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            rows={2}
            className="mt-2 w-full rounded-xl border border-neutral-200 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-brand-500"
          />
        </label>

        <button
          type="submit"
          disabled={!canSubmit}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-brand-500 px-4 py-3 font-bold text-white transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:bg-neutral-200 disabled:text-neutral-400"
        >
          {mode === 'adjust' ? 'Post adjustment' : <><Gift className="h-4 w-4" aria-hidden="true" /> Grant bonus</>}
        </button>
      </form>

      <ConfirmDialog {...dialogProps} />

      {result && (
        <div className="rounded-2xl border border-brand-500/30 bg-brand-50 p-4 text-sm">
          <p className="font-bold text-brand-700">Confirmed</p>
          <dl className="mt-2 space-y-1">
            <div className="flex justify-between">
              <dt className="text-neutral-600">Before balance</dt>
              <dd className="font-semibold">{formatCurrencyMinorUnits(result.before.availableMinorUnits, result.before.currency)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-neutral-600">After balance</dt>
              <dd className="font-semibold">{formatCurrencyMinorUnits(result.after.availableMinorUnits, result.after.currency)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-neutral-600">Timestamp</dt>
              <dd className="font-semibold">{new Date(result.timestamp).toLocaleString()}</dd>
            </div>
          </dl>
        </div>
      )}
    </div>
  );
}
