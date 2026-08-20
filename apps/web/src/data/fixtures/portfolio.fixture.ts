import type { PortfolioSummary } from '@/types/market';

/**
 * DEV FIXTURE — not a real account balance. There is no wallet/ledger API
 * yet (that's Phase 2 — see docs/ARCHITECTURE.md §F/§U), and this value
 * must never be treated as authoritative even after one exists: per the
 * architecture, balances are always server-derived from the ledger, never
 * client-computed or hardcoded. This placeholder exists purely so the
 * portfolio card has something to render during UI development.
 */
export const PORTFOLIO_FIXTURE: PortfolioSummary = {
  balanceUsd: 39.8,
  changePercent24h: 0.29,
};
