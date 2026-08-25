/**
 * FentiCoin product mark. `inverse` is used on dark hero/auth surfaces.
 */
export function Logo({ compact = false, inverse = false }: { compact?: boolean; inverse?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-500 text-sm font-bold text-white shadow-sm">F</span>
      {!compact && <span className={`text-lg font-bold tracking-tight ${inverse ? 'text-white' : 'text-neutral-900'}`}>FentiCoin</span>}
    </div>
  );
}
