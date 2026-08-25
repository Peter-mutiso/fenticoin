import { AdminShell } from '@/components/layout/AdminShell';
import { OddsConfigView } from '@/components/betting/OddsConfigView';

export default function OddsConfigsPage() {
  return (
    <AdminShell>
      <div className="pb-8">
        <h1 className="text-2xl font-bold tracking-tight">Odds &amp; betting configuration</h1>
        <p className="mt-1 text-sm text-neutral-500">Pick an instrument to view or edit its stake limits, payout rate, and duration bounds for each bet type.</p>
        <div className="mt-5">
          <OddsConfigView />
        </div>
      </div>
    </AdminShell>
  );
}
