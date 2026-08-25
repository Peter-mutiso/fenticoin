import type { PriceQuote } from '@/lib/api-client';

/** Live/stale price display, extracted from the betting flow for reuse on Home's featured instruments and the Markets detail page. */
export function PriceQuoteBadge({
  price,
  currency,
  loading,
  className = '',
}: {
  price?: PriceQuote;
  currency: string;
  loading: boolean;
  className?: string;
}) {
  if (loading) return <p className={`text-sm text-neutral-500 ${className}`}>Getting latest price…</p>;
  if (!price) return null;
  return (
    <div className={`rounded-xl p-3 ${price.isStale ? 'bg-loss-50 text-loss-500' : 'bg-neutral-50'} ${className}`}>
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
