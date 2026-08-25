import { AdminShell } from '@/components/layout/AdminShell';
import { RoleTable } from '@/components/rbac/RoleTable';

export default function RolesPage() {
  return (
    <AdminShell>
      <div className="pb-8">
        <h1 className="text-2xl font-bold tracking-tight">Roles</h1>
        <p className="mt-1 text-sm text-neutral-500">The seeded role → permission matrix. Assign roles to a user from their detail page.</p>
        <div className="mt-5">
          <RoleTable />
        </div>
      </div>
    </AdminShell>
  );
}
