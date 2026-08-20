import type { MarketAsset } from '@/types/market';

/**
 * DEV FIXTURE — not real market data, not connected to any price feed.
 *
 * This exists so the watchlist UI has something to render before the
 * markets/price-feed API (docs/ARCHITECTURE.md §G) exists. It is
 * deliberately isolated here, under `data/fixtures/`, and imported only by
 * page-level wiring — never by the presentational components themselves
 * (`AssetCard`, `WatchlistSection`), which only know about the
 * `MarketAsset` type. Swapping this for a real API call later means
 * changing one import, not touching any component.
 */
export const WATCHLIST_FIXTURE: MarketAsset[] = [
  { id: 'eth', symbol: 'ETH', name: 'Ethereum', priceUsd: 4588.81, changePercent24h: -5.62 },
  { id: 'btc', symbol: 'BTC', name: 'Bitcoin', priceUsd: 112503.27, changePercent24h: -1.55 },
  { id: 'usdc', symbol: 'USDC', name: 'USDC', priceUsd: 1.0, changePercent24h: -0.02 },
  { id: 'sol', symbol: 'SOL', name: 'Solana', priceUsd: 196.89, changePercent24h: -5.34 },
  { id: 'xrp', symbol: 'XRP', name: 'Ripple', priceUsd: 2.31, changePercent24h: -2.97 },
  { id: 'doge', symbol: 'DOGE', name: 'Dogecoin', priceUsd: 0.318, changePercent24h: -6.6 },
];
