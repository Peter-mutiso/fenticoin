import type { PriceQuote } from '@/lib/api-client';

/** Live/stale price display, extracted from the betting flow for reuse on Home's featured instruments and the Markets detail page. */
export function PriceQuoteBadge({
  price,
  currency,
  loading,
  className = '',
  compact = false,
}: {
  price?: PriceQuote;
  currency: string;
  loading: boolean;
  className?: string;
  /** A single-line price only — no source/timestamp footer — for tight spaces like a market list row or watchlist tile, where the full badge's unwrapped footer text would force the row wider than its container. */
  compact?: boolean;
}) {
  if (loading) return <p className={`text-sm text-neutral-500 ${className}`}>{compact ? '…' : 'Getting latest price…'}</p>;
  if (!price) return null;

  if (compact) {
    return (
      <span className={`inline-flex items-center gap-1.5 whitespace-nowrap text-sm font-bold tabular-nums ${price.isStale ? 'text-loss-700' : 'text-neutral-900'} ${className}`}>
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${price.isStale ? 'bg-loss-500' : 'bg-brand-500'}`} aria-hidden="true" title={price.isStale ? 'Stale price' : 'Live price'} />
        {price.price} {currency}
      </span>
    );
  }

  return (
    <div className={`rounded-xl p-3 ${price.isStale ? 'bg-loss-50 text-loss-700' : 'bg-neutral-50'} ${className}`}>
      <div className="flex justify-between">
        <span className="text-xs font-semibold text-neutral-500">Live price</span>
        <span className="text-xs">{price.isStale ? 'STALE' : 'LIVE'}</span>
      </div>
      <p className="mt-1 text-xl font-bold">
        {price.price} {currency}
      </p>
      <p className="mt-1 text-xs text-neutral-500">
        {price.source} · updated {new Date(price.observedAt).toLocaleTimeString()}
      </p>
    </div>
  );
}
