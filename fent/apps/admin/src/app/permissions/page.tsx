import { AdminShell } from '@/components/layout/AdminShell';
import { PermissionTable } from '@/components/rbac/PermissionTable';

export default function PermissionsPage() {
  return (
    <AdminShell>
      <div className="pb-8">
        <h1 className="text-2xl font-bold tracking-tight">Permissions</h1>
        <p className="mt-1 text-sm text-neutral-500">Every granular permission the platform understands, grouped by area.</p>
        <div className="mt-5">
          <PermissionTable />
        </div>
      </div>
    </AdminShell>
  );
}
