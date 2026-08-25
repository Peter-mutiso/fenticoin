import { ArrowUpRight } from 'lucide-react';
import Link from 'next/link';

import { formatCurrencyMinorUnits } from '@/lib/money';

/** The FentiCoin style portfolio balance card with Deposit & Withdraw buttons. */
export function BalanceCard({
  availableMinorUnits,
  currency,
}: {
  availableMinorUnits: string;
  lockedMinorUnits?: string;
  currency: string;
  showLocked?: boolean;
}) {
  return (
    <div className="rounded-3xl bg-[#091628] p-5 text-white shadow-xl border border-white/10 sm:p-6">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-white/60">Real Portfolio</span>
        <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-1 text-xs font-bold text-white/60">
          <ArrowUpRight className="h-3.5 w-3.5" /> Performance unavailable
        </span>
      </div>

      <p className="mt-2 text-3xl font-bold tracking-tight">
        {formatCurrencyMinorUnits(availableMinorUnits, currency)}
      </p>

      {/* Deposit and Withdraw Action Buttons side-by-side */}
      <div className="mt-5 grid grid-cols-2 gap-3">
        <Link
          href="/account/deposit"
          className="flex items-center justify-center rounded-2xl bg-[#00C853] py-3 text-sm font-bold text-neutral-950 shadow-lg shadow-emerald-500/20 transition hover:bg-[#00b048]"
        >
          Deposit
        </Link>
        <Link
          href="/account/withdraw"
          className="flex items-center justify-center rounded-2xl bg-[#1e293b] py-3 text-sm font-bold text-white/90 border border-white/10 transition hover:bg-[#273548]"
        >
          Withdraw
        </Link>
      </div>
    </div>
  );
}