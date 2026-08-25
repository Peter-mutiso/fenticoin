import { AdminShell } from '@/components/layout/AdminShell';
import { InstrumentsList } from '@/components/markets/InstrumentsList';

export default function MarketsPage() {
  return (
    <AdminShell>
      <div className="pb-8">
        <h1 className="text-2xl font-bold tracking-tight">Markets &amp; instruments</h1>
        <div className="mt-5">
          <InstrumentsList />
        </div>
      </div>
    </AdminShell>
  );
}
