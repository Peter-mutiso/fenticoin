import { Wallet, User } from 'lucide-react';

import type { PortfolioSummary } from '@/types/market';
import { formatUsd } from '@/lib/format';
import { Logo } from './Logo';

export function Header({ portfolio }: { portfolio: PortfolioSummary }) {
  return (
    <header className="flex items-center justify-between px-4 py-4 sm:px-6 lg:justify-end lg:px-8 lg:py-6">
      <div className="lg:hidden">
        <Logo />
      </div>

      <div className="flex items-center gap-2 sm:gap-3">
        <div className="flex items-center gap-1.5 rounded-full bg-navy-950 py-2 pl-3 pr-3.5 text-white sm:pl-3.5 sm:pr-4">
          <Wallet className="h-4 w-4 text-brand-500" aria-hidden="true" />
          <span className="text-sm font-semibold sm:text-base">{formatUsd(portfolio.balanceUsd)}</span>
        </div>

        <button
          type="button"
          aria-label="Account"
          className="flex h-9 w-9 items-center justify-center rounded-full border border-neutral-200 text-neutral-500 transition hover:bg-neutral-50 sm:h-10 sm:w-10"
        >
          <User className="h-4 w-4 sm:h-5 sm:w-5" aria-hidden="true" />
        </button>
      </div>
    </header>
  );
}
