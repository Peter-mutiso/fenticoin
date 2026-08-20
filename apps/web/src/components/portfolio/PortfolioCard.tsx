import { ArrowDownToLine, ArrowUpFromLine } from 'lucide-react';

import type { PortfolioSummary } from '@/types/market';
import { formatUsd } from '@/lib/format';
import { PercentageChange } from '@/components/ui/PercentageChange';

export function PortfolioCard({ portfolio }: { portfolio: PortfolioSummary }) {
  return (
    <section
      aria-label="Portfolio balance"
      className="rounded-2xl bg-navy-950 px-5 py-5 text-white shadow-sm sm:px-6 sm:py-6"
    >
      <p className="text-xs font-medium text-white/60 sm:text-sm">Real Portfolio</p>

      <div className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="text-3xl font-bold tracking-tight sm:text-4xl">
          {formatUsd(portfolio.balanceUsd)}
        </span>
        <PercentageChange value={portfolio.changePercent24h} />
      </div>

      <div className="mt-5 flex gap-3 sm:mt-6">
        <button
          type="button"
          className="inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-600 sm:flex-none sm:px-6"
        >
          <ArrowDownToLine className="h-4 w-4" aria-hidden="true" />
          Deposit
        </button>
        <button
          type="button"
          className="inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-white/10 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-white/15 sm:flex-none sm:px-6"
        >
          <ArrowUpFromLine className="h-4 w-4" aria-hidden="true" />
          Withdraw
        </button>
      </div>
    </section>
  );
}
