'use client';

import { LogOut, User } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

import { useAuth } from '@/lib/auth/AuthContext';

export function AccountMenu() {
  const { status, user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [open]);

  if (status !== 'authenticated' || !user) {
    return (
      <Link
        href="/login"
        className="inline-flex h-9 items-center rounded-full border border-neutral-200 px-4 text-sm font-semibold text-neutral-700 transition hover:bg-neutral-50 sm:h-10"
      >
        Log in
      </Link>
    );
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        aria-label="Account"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex h-9 w-9 items-center justify-center rounded-full border border-neutral-200 text-neutral-500 transition hover:bg-neutral-50 sm:h-10 sm:w-10"
      >
        <User className="h-4 w-4 sm:h-5 sm:w-5" aria-hidden="true" />
      </button>

      {open && (
        <div className="absolute right-0 top-11 z-30 w-56 rounded-2xl border border-neutral-200 bg-white p-2 shadow-lg sm:top-12">
          <p className="truncate px-3 py-2 text-xs text-neutral-500">{user.email}</p>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              void logout();
            }}
            className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-semibold text-neutral-700 transition hover:bg-neutral-50"
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
            Log out
          </button>
        </div>
      )}
    </div>
  );
}
