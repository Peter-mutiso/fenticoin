/**
 * Display-only market/quote data shapes for the markets & watchlist UI.
 *
 * These are NOT ledger/wallet types — they never back a real money
 * balance, so plain `number` is fine here (unlike account balances, which
 * must always come from the backend ledger as integer minor units; see
 * `docs/ARCHITECTURE.md` §F). Nothing in this file is wired to a real
 * price feed yet — see `src/data/fixtures/` for the current placeholder
 * data source, which is intentionally isolated from these type
 * definitions so swapping in a real API later doesn't touch this file.
 */
export interface MarketAsset {
  id: string;
  symbol: string;
  name: string;
  priceUsd: number;
  changePercent24h: number;
}

export function isPositiveChange(asset: Pick<MarketAsset, 'changePercent24h'>): boolean {
  return asset.changePercent24h >= 0;
}

/**
 * The user's overall trading-account summary, as it will eventually be
 * returned by the wallet/ledger API (Phase 2). `balanceUsd` here is
 * display-only placeholder data — the real endpoint will return integer
 * minor units, not a float, per the ledger architecture.
 */
export interface PortfolioSummary {
  balanceUsd: number;
  changePercent24h: number;
}
