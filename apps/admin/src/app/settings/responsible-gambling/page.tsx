import { AdminShell } from '@/components/layout/AdminShell';
import { NotImplementedNotice } from '@/components/ui/NotImplementedNotice';

export default function ResponsibleGamblingSettingsPage() {
  return (
    <AdminShell>
      <div className="pb-8">
        <h1 className="text-2xl font-bold tracking-tight">Responsible gambling</h1>
        <div className="mt-5">
          <NotImplementedNotice
            title="Responsible gambling controls aren't available yet"
            description="Deposit/loss/session limits and self-exclusion aren't built on the backend — this mirrors the same gap on the user-facing app's own account settings."
          />
        </div>
      </div>
    </AdminShell>
  );
}
