import { AppShell } from '@/components/layout/AppShell';
import { MarketsBrowser } from '@/components/markets/MarketsBrowser';

export default function MarketsPage() {
  return (
    <AppShell>
      <div className="pb-8">
        <h1 className="text-3xl font-bold tracking-tight">Markets</h1>
        <p className="mt-1 text-sm text-neutral-500">Browse every instrument available to trade.</p>
        <div className="mt-5">
          <MarketsBrowser />
        </div>
      </div>
    </AppShell>
  );
}
