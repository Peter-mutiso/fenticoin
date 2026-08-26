'use client';

import { useQuery } from '@tanstack/react-query';
import { Lock, Wallet } from 'lucide-react';
import { useState } from 'react';

import { getWalletBalance } from '@/lib/api-client';
import { describeApiError } from '@/lib/api-errors';
import { formatCurrencyMinorUnits, SUPPORTED_CURRENCY_CODES } from '@/lib/money';
import { RequirePermission } from '@/components/auth/RequirePermission';
import { Notice } from '@/components/ui/Notice';
import { AdjustBalanceForm } from '@/components/finance/AdjustBalanceForm';

export function UserWalletTab({ userId }: { userId: string }) {
  const [currency, setCurrency] = useState(SUPPORTED_CURRENCY_CODES[0] ?? 'USD');
  // No realtime relay covers wallet changes on the admin socket yet — poll as a fallback, matching the convention used by DepositsList/WithdrawalsList/RiskQueue.
  const balanceQuery = useQuery({ queryKey: ['wallet', userId, currency], queryFn: () => getWalletBalance(userId, currency), refetchInterval: 30_000 });

  return (
    <div className="space-y-4">
      {SUPPORTED_CURRENCY_CODES.length > 1 && (
        <div className="flex gap-2">
          {SUPPORTED_CURRENCY_CODES.map((code) => (
            <button
              key={code}
              type="button"
              onClick={() => setCurrency(code)}
              className={`rounded-full px-3.5 py-1.5 text-xs font-bold transition ${
                currency === code ? 'bg-navy-950 text-white' : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
              }`}
            >
              {code}
            </button>
          ))}
        </div>
      )}

      {balanceQuery.isLoading ? (
        <div className="h-24 animate-pulse rounded-2xl bg-neutral-100" />
      ) : balanceQuery.error ? (
        <Notice text={describeApiError(balanceQuery.error).title} />
      ) : balanceQuery.data ? (
        <div className="rounded-2xl bg-navy-950 p-5 text-white shadow-sm">
          <div className="flex items-center gap-2 text-white/65">
            <Wallet className="h-4 w-4" aria-hidden="true" />
            <span className="text-sm font-semibold">Available balance</span>
          </div>
          <p className="mt-2 text-3xl font-bold tracking-tight">{formatCurrencyMinorUnits(balanceQuery.data.availableMinorUnits, balanceQuery.data.currency)}</p>
          <div className="mt-4 flex items-center justify-between border-t border-white/10 pt-4 text-sm">
            <span className="flex items-center gap-1.5 text-white/60">
              <Lock className="h-3.5 w-3.5" aria-hidden="true" />
              Locked in open bets
            </span>
            <span className="font-semibold">{formatCurrencyMinorUnits(balanceQuery.data.lockedMinorUnits, balanceQuery.data.currency)}</span>
          </div>
        </div>
      ) : null}

      <RequirePermission permission="wallet.adjust">
        <div>
          <h2 className="mb-2 text-sm font-bold text-neutral-900">Manual balance adjustment</h2>
          <AdjustBalanceForm key={currency} userId={userId} mode="adjust" currency={currency} />
        </div>
      </RequirePermission>
    </div>
  );
}
