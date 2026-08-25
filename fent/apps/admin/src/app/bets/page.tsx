import { AdminShell } from '@/components/layout/AdminShell';
import { BetsList } from '@/components/betting/BetsList';

export default function BetsPage() {
  return (
    <AdminShell>
      <div className="pb-8">
        <h1 className="text-2xl font-bold tracking-tight">Bets</h1>
        <p className="mt-1 text-sm text-neutral-500">Active, completed, cancelled/void, and disputed bets across the platform.</p>
        <div className="mt-5">
          <BetsList />
        </div>
      </div>
    </AdminShell>
  );
}
