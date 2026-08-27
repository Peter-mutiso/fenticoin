'use client';

import { Menu, X } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import { useAuth } from '@/lib/auth/AuthContext';
import { Logo } from '@/components/layout/Logo';

const NAV_LINKS = [
  { href: '/markets', label: 'Markets' },
  { href: '#how-it-works', label: 'How It Works' },
  { href: '#security', label: 'Security' },
  { href: '#faq', label: 'FAQ' },
];

/** The public marketing site's own header — distinct from the authenticated app's `SidebarNav`/`Header`, since this is for anonymous visitors (or an authenticated visitor who navigated back to the marketing homepage), not the trading app shell. */
export function PublicHeader() {
  const { status } = useAuth();
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-30 border-b border-white/10 bg-navy-950/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link href="/" aria-label="FentiCoin home">
          <Logo inverse />
        </Link>

        <nav aria-label="Primary" className="hidden items-center gap-8 lg:flex">
          {NAV_LINKS.map((link) => (
            <a key={link.href} href={link.href} className="text-sm font-semibold text-white/70 transition hover:text-white">
              {link.label}
            </a>
          ))}
        </nav>

        <div className="hidden items-center gap-3 lg:flex">
          {status === 'authenticated' ? (
            <Link href="/dashboard" className="rounded-full bg-brand-500 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-brand-600">
              Go to Dashboard
            </Link>
          ) : (
            <>
              <Link href="/login" className="text-sm font-semibold text-white/80 transition hover:text-white">
                Log In
              </Link>
              <Link href="/signup" className="rounded-full bg-brand-500 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-brand-600">
                Sign Up
              </Link>
            </>
          )}
        </div>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex h-10 w-10 items-center justify-center rounded-full text-white lg:hidden"
          aria-label={open ? 'Close menu' : 'Open menu'}
          aria-expanded={open}
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {open && (
        <div className="border-t border-white/10 bg-navy-950 px-4 pb-6 pt-2 lg:hidden">
          <nav aria-label="Primary" className="flex flex-col gap-1">
            {NAV_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className="rounded-xl px-3 py-2.5 text-sm font-semibold text-white/75 transition hover:bg-white/5 hover:text-white"
              >
                {link.label}
              </a>
            ))}
          </nav>
          <div className="mt-4 flex flex-col gap-2">
            {status === 'authenticated' ? (
              <Link href="/dashboard" className="rounded-xl bg-brand-500 px-4 py-3 text-center text-sm font-bold text-white">
                Go to Dashboard
              </Link>
            ) : (
              <>
                <Link href="/login" className="rounded-xl border border-white/15 px-4 py-3 text-center text-sm font-bold text-white">
                  Log In
                </Link>
                <Link href="/signup" className="rounded-xl bg-brand-500 px-4 py-3 text-center text-sm font-bold text-white">
                  Sign Up
                </Link>
              </>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
