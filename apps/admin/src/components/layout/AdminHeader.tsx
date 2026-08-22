'use client';

import { LogOut, Menu, ShieldHalf, User } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { useAuth } from '@/lib/auth/AuthContext';

export function AdminHeader({ onOpenMobileNav }: { onOpenMobileNav: () => void }) {
  const { status, user, roles, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function onClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [menuOpen]);

  return (
    <header className="flex items-center justify-between border-b border-neutral-200 bg-white px-4 py-3 sm:px-6 lg:px-8">
      <button type="button" onClick={onOpenMobileNav} aria-label="Open menu" className="text-neutral-500 hover:text-neutral-900 lg:hidden">
        <Menu className="h-5 w-5" aria-hidden="true" />
      </button>
      <div className="hidden items-center gap-2 lg:flex">
        <ShieldHalf className="h-4 w-4 text-brand-600" aria-hidden="true" />
        <p className="text-sm font-semibold text-neutral-500">Administrative control panel</p>
      </div>

      {status === 'authenticated' && user && (
        <div ref={containerRef} className="relative">
          <button
            type="button"
            aria-label="Account"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((value) => !value)}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-neutral-200 text-neutral-500 transition hover:bg-neutral-50 sm:h-10 sm:w-10"
          >
            <User className="h-4 w-4 sm:h-5 sm:w-5" aria-hidden="true" />
          </button>

          {menuOpen && (
            <div className="absolute right-0 top-11 z-30 w-64 rounded-2xl border border-neutral-200 bg-white p-2 shadow-lg sm:top-12">
              <p className="truncate px-3 py-2 text-xs text-neutral-500">{user.email}</p>
              {roles.length > 0 && (
                <p className="flex flex-wrap gap-1 px-3 pb-2">
                  {roles.map((role) => (
                    <span key={role} className="rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-semibold text-neutral-600">
                      {role}
                    </span>
                  ))}
                </p>
              )}
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
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
      )}
    </header>
  );
}
