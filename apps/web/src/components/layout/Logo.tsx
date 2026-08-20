/**
 * Original mark for this project — deliberately not a reproduction of any
 * third-party logo. Just a simple geometric monogram in the brand color.
 */
export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-500 text-sm font-bold text-white">
        F
      </span>
      {!compact && <span className="text-lg font-bold tracking-tight text-neutral-900">FentiCoin</span>}
    </div>
  );
}
