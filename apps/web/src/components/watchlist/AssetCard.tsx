import type { MarketAsset } from '@/types/market';
import { isPositiveChange } from '@/types/market';
import { formatUsd } from '@/lib/format';
import { PercentageChange } from '@/components/ui/PercentageChange';

export function AssetCard({ asset }: { asset: MarketAsset }) {
  const positive = isPositiveChange(asset);

  return (
    <article
      className={`relative overflow-hidden rounded-2xl border-l-4 py-3 pl-3 pr-3 sm:py-4 sm:pl-4 sm:pr-4 ${
        positive ? 'border-brand-500 bg-brand-50' : 'border-loss-500 bg-loss-50'
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="rounded-full bg-white/70 px-2 py-0.5 text-[11px] font-semibold text-neutral-700 sm:text-xs">
          {asset.symbol}
        </span>
        <PercentageChange value={asset.changePercent24h} />
      </div>

      <p className="mt-2 text-base font-bold text-neutral-900 sm:text-lg">{asset.symbol}</p>
      <p className="truncate text-xs text-neutral-500 sm:text-sm">{asset.name}</p>
      <p className="mt-2 text-sm font-semibold text-neutral-900 sm:text-base">{formatUsd(asset.priceUsd)}</p>
    </article>
  );
}
