'use client';

import { AlertTriangle, RefreshCw } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';

import { useAuth } from '@/lib/auth/AuthContext';
import { BottomNav } from './BottomNav';
import { Header } from './Header';
import { NAV_ITEMS } from './nav-items';
import { SidebarNav } from './SidebarNav';

/**
 * The authenticated-app chrome (sidebar/header/bottom nav) shared by every
 * in-app page. Pages that are only meaningful for a logged-in user
 * (`/dashboard`, `/portfolio`, `/bet-history`, `/transactions`,
 * `/notifications`, `/account*`) pass `requireAuth` to redirect an
 * unauthenticated visitor to `/login?redirect=<path>` rather than showing
 * empty/banner states in place of real data. Genuinely public pages
 * (`/markets`, `/markets/[id]`) omit it and render normally for anyone.
 */
export function AppShell({ children, requireAuth = false }: { children: React.ReactNode; requireAuth?: boolean }) {
  const { status, hydrationError, retry } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  const blocked = requireAuth && status === 'unauthenticated';

  useEffect(() => {
    if (blocked && hydrationError !== 'network') {
      router.replace(`/login?redirect=${encodeURIComponent(pathname)}`);
    }
  }, [blocked, hydrationError, pathname, router]);

  if (requireAuth && status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-neutral-200 border-t-brand-500" />
      </div>
    );
  }

  if (blocked && hydrationError === 'network') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-white px-6 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-50 text-amber-600">
          <AlertTriangle className="h-6 w-6" aria-hidden="true" />
        </div>
        <div>
          <p className="text-lg font-semibold text-neutral-900">Can&rsquo;t reach the FentiCoin API</p>
          <p className="mt-1 text-sm text-neutral-500">Check your connection and try again.</p>
        </div>
        <button
          type="button"
          onClick={retry}
          className="inline-flex items-center gap-2 rounded-full bg-brand-500 px-5 py-2.5 text-sm font-bold text-navy-950 transition hover:bg-brand-600"
        >
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          Retry
        </button>
      </div>
    );
  }

  if (blocked) {
    // Mid-redirect (the effect above fires the actual navigation) — avoid
    // a flash of the real page's content while it resolves.
    return (
      <div className="flex min-h-screen items-center justify-center bg-white">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-neutral-200 border-t-brand-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      <SidebarNav items={NAV_ITEMS} />

      <div className="lg:pl-60 xl:pl-64">
        <Header />

        <main className="mx-auto max-w-3xl px-4 pb-24 sm:px-6 lg:px-8 lg:pb-12">{children}</main>
      </div>

      <BottomNav items={NAV_ITEMS} />
    </div>
  );
}
