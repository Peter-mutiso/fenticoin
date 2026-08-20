import type { NavItem } from './nav-items';

export function BottomNav({
  items,
  activeId,
  onSelect,
}: {
  items: NavItem[];
  activeId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-20 border-t border-neutral-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
    >
      <ul className="mx-auto flex max-w-md items-end justify-between px-4 pb-2 pt-2">
        {items.map((item) => {
          const isActive = item.id === activeId;
          const Icon = item.icon;

          if (item.primary) {
            return (
              <li key={item.id} className="-mt-6 flex flex-col items-center">
                <button
                  type="button"
                  onClick={() => onSelect(item.id)}
                  aria-current={isActive ? 'page' : undefined}
                  aria-label={item.label}
                  className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-500 text-white shadow-lg shadow-brand-500/30 transition hover:bg-brand-600"
                >
                  <Icon className="h-6 w-6" aria-hidden="true" />
                </button>
              </li>
            );
          }

          return (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => onSelect(item.id)}
                aria-current={isActive ? 'page' : undefined}
                className={`flex flex-col items-center gap-1 px-2 py-1 text-[11px] font-medium ${
                  isActive ? 'text-brand-600' : 'text-neutral-400'
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
  );
}
