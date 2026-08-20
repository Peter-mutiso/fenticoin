import { User } from 'lucide-react';

import { Logo } from './Logo';
import type { NavItem } from './nav-items';

export function SidebarNav({
  items,
  activeId,
  onSelect,
}: {
  items: NavItem[];
  activeId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <aside
      aria-label="Primary"
      className="fixed inset-y-0 left-0 z-20 hidden w-60 flex-col border-r border-neutral-200 bg-white px-4 py-6 lg:flex xl:w-64"
    >
      <div className="px-2">
        <Logo />
      </div>

      <nav className="mt-8 flex-1">
        <ul className="space-y-1">
          {items.map((item) => {
            const isActive = item.id === activeId;
            const Icon = item.icon;

            return (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => onSelect(item.id)}
                  aria-current={isActive ? 'page' : undefined}
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${
                    isActive ? 'bg-brand-50 text-brand-600' : 'text-neutral-500 hover:bg-neutral-50 hover:text-neutral-900'
                  }`}
                >
                  <Icon className="h-5 w-5" aria-hidden="true" />
                  {item.label}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      <button
        type="button"
        className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-neutral-500 transition hover:bg-neutral-50 hover:text-neutral-900"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-neutral-100">
          <User className="h-4 w-4" aria-hidden="true" />
        </span>
        Account
      </button>
    </aside>
  );
}
