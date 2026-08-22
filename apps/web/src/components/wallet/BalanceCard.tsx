import { Lock, Wallet } from 'lucide-react';

import { formatCurrencyMinorUnits } from '@/lib/money';

/** The navy-950 balance summary card used on Home and Portfolio — shows available balance, and locked balance when it's meaningful (i.e. non-zero or explicitly requested). */
export function BalanceCard({
  availableMinorUnits,
  lockedMinorUnits,
  currency,
  showLocked = false,
}: {
  availableMinorUnits: string;
  lockedMinorUnits?: string;
  currency: string;
  showLocked?: boolean;
}) {
  return (
    <div className="rounded-2xl bg-navy-950 p-5 text-white shadow-sm sm:p-6">
      <div className="flex items-center gap-2 text-white/65">
        <Wallet className="h-4 w-4" aria-hidden="true" />
        <span className="text-sm font-semibold">Available balance</span>
      </div>
      <p className="mt-2 text-3xl font-bold tracking-tight">{formatCurrencyMinorUnits(availableMinorUnits, currency)}</p>

      {showLocked && lockedMinorUnits !== undefined && (
        <div className="mt-4 flex items-center justify-between border-t border-white/10 pt-4 text-sm">
          <span className="flex items-center gap-1.5 text-white/60">
            <Lock className="h-3.5 w-3.5" aria-hidden="true" />
            Locked in open bets
          </span>
          <span className="font-semibold">{formatCurrencyMinorUnits(lockedMinorUnits, currency)}</span>
        </div>
      )}
    </div>
  );
}
