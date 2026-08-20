import { AppShell } from '@/components/layout/AppShell';
import { PortfolioCard } from '@/components/portfolio/PortfolioCard';
import { WatchlistSection } from '@/components/watchlist/WatchlistSection';
import { PORTFOLIO_FIXTURE } from '@/data/fixtures/portfolio.fixture';
import { WATCHLIST_FIXTURE } from '@/data/fixtures/watchlist.fixture';

// TODO(wallet-api, markets-api): once the ledger and markets services exist
// (docs/ARCHITECTURE.md §F/§G), replace these fixture imports with real
// data fetching. Every component below only depends on the typed shapes in
// `@/types/market`, not on where the data came from.
export default function HomePage() {
  return (
    <AppShell portfolio={PORTFOLIO_FIXTURE}>
      <PortfolioCard portfolio={PORTFOLIO_FIXTURE} />
      <WatchlistSection assets={WATCHLIST_FIXTURE} />
    </AppShell>
  );
}
