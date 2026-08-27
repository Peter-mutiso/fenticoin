'use client';

import { AccountMenu } from '@/components/auth/AccountMenu';
import { AccountSwitcher } from '@/components/auth/AccountSwitcher';
import { NotificationBell } from '@/components/notifications/NotificationBell';
import { Logo } from './Logo';

/**
 * `AccountSwitcher` is the persistent, always-visible REAL/DEMO indicator
 * and switch control — it renders its own balance pill and is a no-op
 * (renders nothing) when unauthenticated, so no separate wallet-balance
 * badge is needed here anymore. Because `Header` renders on every
 * authenticated route via `AppShell`, this single control also satisfies
 * "show account context on Trade/Bots/Wallet/Dashboard" without a
 * duplicated badge on each page.
 */
export function Header() {
  return (
    <header className="flex items-center justify-between px-4 py-4 sm:px-6 lg:justify-end lg:px-8 lg:py-6">
      <div className="lg:hidden">
        <Logo />
      </div>

      <div className="flex items-center gap-2 sm:gap-3">
        <AccountSwitcher />
        <NotificationBell />
        <AccountMenu />
      </div>
    </header>
  );
}
