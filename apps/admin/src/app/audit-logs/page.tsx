import { AdminShell } from '@/components/layout/AdminShell';
import { AuditLogView } from '@/components/audit/AuditLogView';

export default function AuditLogsPage() {
  return (
    <AdminShell>
      <div className="pb-8">
        <h1 className="text-2xl font-bold tracking-tight">Audit logs</h1>
        <p className="mt-1 text-sm text-neutral-500">Every sensitive admin action, append-only.</p>
        <div className="mt-5">
          <AuditLogView />
        </div>
      </div>
    </AdminShell>
  );
}
