import { AdminShell } from '@/components/layout/AdminShell';
import { DashboardView } from '@/components/dashboard/DashboardView';

export default function DashboardPage() {
  return (
    <AdminShell>
      <div className="pb-8">
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <div className="mt-5">
          <DashboardView />
        </div>
      </div>
    </AdminShell>
  );
}
