import { ChevronRight } from 'lucide-react';

import type { MarketAsset } from '@/types/market';
import { AssetCard } from './AssetCard';

export function WatchlistSection({ assets }: { assets: MarketAsset[] }) {
  return (
    <section aria-labelledby="watchlist-heading" className="mt-6 sm:mt-8">
      <div className="mb-3 flex items-center justify-between sm:mb-4">
        <h2 id="watchlist-heading" className="text-lg font-bold text-neutral-900 sm:text-xl">
          Watchlist
        </h2>
        <button
          type="button"
          className="inline-flex items-center gap-0.5 text-sm font-semibold text-brand-600 hover:text-brand-500"
        >
          See All
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4">
        {assets.map((asset) => (
          <AssetCard key={asset.id} asset={asset} />
        ))}
      </div>
    </section>
  );
}
