import { AppShell } from '@/components/layout/AppShell';
import { PortfolioView } from '@/components/portfolio/PortfolioView';

export default function PortfolioPage() {
  return (
    <AppShell requireAuth>
      <div className="pb-8">
        <h1 className="text-3xl font-bold tracking-tight">Portfolio</h1>
        <div className="mt-5">
          <PortfolioView />
        </div>
      </div>
    </AppShell>
  );
}
