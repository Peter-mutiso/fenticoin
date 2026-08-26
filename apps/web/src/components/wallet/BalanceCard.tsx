import Link from 'next/link';

import { formatCurrencyMinorUnits } from '@/lib/money';

/**
 * The FentiCoin style portfolio balance card. For a real account it links
 * to Deposit & Withdraw; for a demo account those actions are server-side
 * blocked anyway (see `deposit-eligibility.service.ts`/
 * `withdrawal-eligibility.service.ts`), so routing there would just be a
 * dead end — instead the card labels itself "Demo Balance" and explains
 * the restriction up front. Real performance figures (when there's
 * settled-bet history to compute them from) are shown separately by
 * `PerformanceSummary` — this card intentionally doesn't duplicate or
 * approximate that here.
 */
export function BalanceCard({
  availableMinorUnits,
  currency,
  isDemo = false,
}: {
  availableMinorUnits: string;
  lockedMinorUnits?: string;
  currency: string;
  showLocked?: boolean;
  isDemo?: boolean;
}) {
  return (
    <div className="rounded-3xl bg-[#091628] p-5 text-white shadow-xl border border-white/10 sm:p-6">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-white/60">{isDemo ? 'Demo Balance' : 'Real Portfolio'}</span>
        {isDemo && (
          <span className="rounded-full bg-brand-500/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-brand-400">
            Virtual funds
          </span>
        )}
      </div>

      <p className="mt-2 text-3xl font-bold tracking-tight">
        {formatCurrencyMinorUnits(availableMinorUnits, currency)}
      </p>

      {isDemo ? (
        <p className="mt-5 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-xs leading-5 text-white/50">
          Demo funds are for practice only and have no real-world value. Deposits and withdrawals are unavailable in Demo Mode.
        </p>
      ) : (
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
      )}
    </div>
  );
}