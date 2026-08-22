'use client';

import { Wallet } from 'lucide-react';

import { AccountMenu } from '@/components/auth/AccountMenu';
import { NotificationBell } from '@/components/notifications/NotificationBell';
import { useAuth } from '@/lib/auth/AuthContext';
import { useWalletBalance } from '@/hooks/useWalletBalance';
import { formatCurrencyMinorUnits } from '@/lib/money';
import { Logo } from './Logo';

export function Header() {
  const { status } = useAuth();
  const balance = useWalletBalance();

  return (
    <header className="flex items-center justify-between px-4 py-4 sm:px-6 lg:justify-end lg:px-8 lg:py-6">
      <div className="lg:hidden">
        <Logo />
      </div>

      <div className="flex items-center gap-2 sm:gap-3">
        {status === 'authenticated' && (
          <div className="flex items-center gap-1.5 rounded-full bg-navy-950 py-2 pl-3 pr-3.5 text-white sm:pl-3.5 sm:pr-4">
            <Wallet className="h-4 w-4 text-brand-500" aria-hidden="true" />
            <span className="text-sm font-semibold sm:text-base">
              {balance.data ? formatCurrencyMinorUnits(balance.data.availableMinorUnits, balance.data.currency) : balance.isLoading ? '…' : '—'}
            </span>
          </div>
        )}

        <NotificationBell />
        <AccountMenu />
      </div>
    </header>
  );
}
