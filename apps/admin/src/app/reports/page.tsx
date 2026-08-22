import { AdminShell } from '@/components/layout/AdminShell';
import { RevenueReportView } from '@/components/reports/RevenueReportView';

export default function ReportsPage() {
  return (
    <AdminShell>
      <div className="pb-8">
        <h1 className="text-2xl font-bold tracking-tight">Reports &amp; analytics</h1>
        <div className="mt-5">
          <RevenueReportView />
        </div>
      </div>
    </AdminShell>
  );
}
