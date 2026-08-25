'use client';

import { AlertTriangle, RefreshCw, ShieldOff } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import { useAuth } from '@/lib/auth/AuthContext';
import { AdminHeader } from './AdminHeader';
import { AdminSidebar } from './AdminSidebar';

/**
 * The admin app's own top-level chrome — navy sidebar, "FentiCoin Admin"
 * branding, grouped 26-area nav — deliberately unmistakable from the
 * user-facing app's light `AppShell`, even though both share the same
 * Tailwind color tokens. Every page renders inside this.
 */
export function AdminShell({ children }: { children: React.ReactNode }) {
  const { status, permissions, hydrationError, retry, logout } = useAuth();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  if (status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-50">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-neutral-200 border-t-brand-500" />
          <p className="text-sm text-neutral-400">Loading…</p>
        </div>
      </div>
    );
  }

  if (status === 'unauthenticated' && hydrationError === 'network') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-neutral-50 px-6 text-center">
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
          className="inline-flex items-center gap-2 rounded-full bg-brand-500 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-brand-600"
        >
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          Retry
        </button>
      </div>
    );
  }

  if (status === 'unauthenticated') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-neutral-50 px-6 text-center">
        <p className="text-lg font-semibold text-neutral-900">You need to log in to access the admin panel.</p>
        <Link href="/login" className="rounded-full bg-brand-500 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-brand-600">
          Log in
        </Link>
      </div>
    );
  }

  if (permissions.length === 0) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-neutral-50 px-6 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-red-50 text-red-600">
          <ShieldOff className="h-6 w-6" aria-hidden="true" />
        </div>
        <div>
          <p className="text-lg font-semibold text-neutral-900">This account has no administrative access.</p>
          <p className="mt-1 max-w-sm text-sm text-neutral-500">Contact a super admin if you believe this is a mistake.</p>
        </div>
        <button
          type="button"
          onClick={() => void logout()}
          className="rounded-full border border-neutral-200 bg-white px-5 py-2.5 text-sm font-bold text-neutral-700 transition hover:bg-neutral-50"
        >
          Log out
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-50">
      <AdminSidebar mobileOpen={mobileNavOpen} onCloseMobile={() => setMobileNavOpen(false)} />

      <div className="lg:pl-64 xl:pl-72">
        <AdminHeader onOpenMobileNav={() => setMobileNavOpen(true)} />
        <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
