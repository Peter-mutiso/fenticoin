'use client';

import { MoreHorizontal, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';

import { useDialogA11y } from '@/lib/useDialogA11y';
import type { NavItem } from './nav-items';

/**
 * The 5 destinations that stay permanently visible in the mobile tab bar.
 * Everything else in `NAV_ITEMS` (History, Transactions, Account) moves
 * into the "More" sheet below — at 320-430px width, 8 flat items is what
 * caused Account to be pushed off-screen entirely and Transactions to be
 * clipped (see mobile audit). A `grid` with a fixed column count (rather
 * than the previous `flex justify-between`) guarantees every visible item
 * gets an equal, non-overflowing share of the bar regardless of label
 * length or viewport width.
 */
const BOTTOM_NAV_IDS = ['home', 'markets', 'trade', 'bot', 'portfolio'];

export function BottomNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);

  const mainItems = items.filter((item) => BOTTOM_NAV_IDS.includes(item.id));
  const overflowItems = items.filter((item) => !BOTTOM_NAV_IDS.includes(item.id));
  const overflowActive = overflowItems.some((item) => Boolean(item.href) && pathname === item.href);

  return (
    <>
      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-20 border-t border-neutral-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
      >
        <ul className="mx-auto grid max-w-md items-end px-1" style={{ gridTemplateColumns: `repeat(${mainItems.length + 1}, minmax(0, 1fr))` }}>
          {mainItems.map((item) => (
            <NavCell key={item.id} item={item} isActive={Boolean(item.href) && pathname === item.href} />
          ))}
          <li className="flex min-w-0 flex-col items-center pb-2 pt-2">
            <button
              type="button"
              onClick={() => setMoreOpen(true)}
              aria-haspopup="dialog"
              aria-expanded={moreOpen}
              className={`flex w-full min-w-0 flex-col items-center gap-1 px-1 py-1 text-[10px] font-medium ${
                overflowActive ? 'text-brand-700' : 'text-neutral-400'
              }`}
            >
              <MoreHorizontal className="h-5 w-5" aria-hidden="true" />
              <span className="truncate">More</span>
            </button>
          </li>
        </ul>
      </nav>

      {moreOpen && <MoreSheet items={overflowItems} pathname={pathname} onClose={() => setMoreOpen(false)} />}
    </>
  );
}

function NavCell({ item, isActive }: { item: NavItem; isActive: boolean }) {
  const Icon = item.icon;

  if (item.primary) {
    return (
      <li className="-mt-6 flex min-w-0 flex-col items-center">
        {item.href ? (
          <Link
            href={item.href}
            aria-current={isActive ? 'page' : undefined}
            aria-label={item.label}
            className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-500 text-navy-950 shadow-lg shadow-brand-500/30 transition hover:bg-brand-600"
          >
            <Icon className="h-6 w-6" aria-hidden="true" />
          </Link>
        ) : (
          <span
            aria-label={item.label}
            title="Coming soon"
            className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-500/50 text-white"
          >
            <Icon className="h-6 w-6" aria-hidden="true" />
          </span>
        )}
      </li>
    );
  }

  const className = `flex min-w-0 w-full flex-col items-center gap-1 px-1 py-1 text-[10px] font-medium ${
    isActive ? 'text-brand-700' : 'text-neutral-400'
  }`;

  return (
    <li className="flex min-w-0 flex-col items-center pb-2 pt-2">
      {item.href ? (
        <Link href={item.href} aria-current={isActive ? 'page' : undefined} className={className}>
          <Icon className="h-5 w-5" aria-hidden="true" />
          <span className="truncate">{item.label}</span>
        </Link>
      ) : (
        <span className={`${className} opacity-50`} title="Coming soon">
          <Icon className="h-5 w-5" aria-hidden="true" />
          <span className="truncate">{item.label}</span>
        </span>
      )}
    </li>
  );
}

/** The mobile-only overflow sheet for secondary destinations (History, Transactions, Account) — same bottom-sheet pattern as `BetDetailModal`/`ResetDemoAccountDialog`, so it's a familiar interaction rather than a new one. */
function MoreSheet({ items, pathname, onClose }: { items: NavItem[]; pathname: string; onClose: () => void }) {
  const containerRef = useDialogA11y<HTMLDivElement>(onClose);

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-navy-950/50 lg:hidden" role="dialog" aria-modal="true" aria-label="More">
      <div ref={containerRef} tabIndex={-1} className="w-full rounded-t-3xl bg-white p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] shadow-xl outline-none">
        <div className="flex items-center justify-between px-2 pb-2">
          <h2 className="text-base font-bold text-neutral-900">More</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="text-neutral-400 transition hover:text-neutral-600">
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        <ul className="space-y-1">
          {items.map((item) => {
            const isActive = Boolean(item.href) && pathname === item.href;
            const Icon = item.icon;
            return (
              <li key={item.id}>
                {item.href ? (
                  <Link
                    href={item.href}
                    onClick={onClose}
                    aria-current={isActive ? 'page' : undefined}
                    className={`flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold transition ${
                      isActive ? 'bg-brand-50 text-brand-700' : 'text-neutral-700 hover:bg-neutral-50'
                    }`}
                  >
                    <Icon className="h-5 w-5" aria-hidden="true" />
                    {item.label}
                  </Link>
                ) : (
                  <span className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold text-neutral-400 opacity-50" title="Coming soon">
                    <Icon className="h-5 w-5" aria-hidden="true" />
                    {item.label}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
