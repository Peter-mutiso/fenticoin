'use client';

import { ShieldHalf, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { useAuth } from '@/lib/auth/AuthContext';
import { NAV_SECTIONS } from './nav-items';

export function AdminSidebar({ mobileOpen = false, onCloseMobile }: { mobileOpen?: boolean; onCloseMobile?: () => void }) {
  const pathname = usePathname();
  const { hasPermission } = useAuth();

  const content = (
    <>
      <div className="flex items-center justify-between px-2">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-500 text-white">
            <ShieldHalf className="h-4 w-4" aria-hidden="true" />
          </span>
          <div>
            <p className="text-sm font-bold tracking-tight text-white">FentiCoin</p>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-brand-500">Admin</p>
          </div>
        </div>
        {onCloseMobile && (
          <button type="button" onClick={onCloseMobile} aria-label="Close menu" className="text-white/60 hover:text-white lg:hidden">
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        )}
      </div>

      <nav className="mt-8 flex-1 space-y-6">
        {NAV_SECTIONS.map((section) => {
          const visibleItems = section.items.filter((item) => !item.permission || hasPermission(item.permission));
          if (visibleItems.length === 0) return null;

          return (
            <div key={section.label}>
              <p className="px-3 text-[11px] font-bold uppercase tracking-wider text-white/40">{section.label}</p>
              <ul className="mt-2 space-y-0.5">
                {visibleItems.map((item) => {
                  const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
                  const Icon = item.icon;
                  return (
                    <li key={item.id}>
                      <Link
                        href={item.href}
                        onClick={onCloseMobile}
                        aria-current={isActive ? 'page' : undefined}
                        className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-semibold transition ${
                          isActive ? 'bg-brand-500/15 text-brand-500' : 'text-white/60 hover:bg-white/5 hover:text-white'
                        }`}
                      >
                        <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                        {item.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </nav>
    </>
  );

  return (
    <>
      <aside aria-label="Primary" className="fixed inset-y-0 left-0 z-20 hidden w-64 flex-col overflow-y-auto border-r border-white/10 bg-navy-950 px-4 py-6 lg:flex xl:w-72">
        {content}
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-navy-950/60" onClick={onCloseMobile} aria-hidden="true" />
          <aside aria-label="Primary" className="absolute inset-y-0 left-0 flex w-72 flex-col overflow-y-auto bg-navy-950 px-4 py-6">
            {content}
          </aside>
        </div>
      )}
    </>
  );
}
