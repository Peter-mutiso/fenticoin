import { BetHistoryList } from '@/components/betting/BetHistoryList';
import { AppShell } from '@/components/layout/AppShell';

export default function BetHistoryPage() {
  return (
    <AppShell requireAuth>
      <div className="pb-8">
        <h1 className="text-3xl font-bold tracking-tight">Bet history</h1>
        <div className="mt-5">
          <BetHistoryList />
        </div>
      </div>
    </AppShell>
  );
}
