import { AdminShell } from '@/components/layout/AdminShell';
import { AdminUsersSearch } from '@/components/rbac/AdminUsersSearch';

export default function AdminUsersPage() {
  return (
    <AdminShell>
      <div className="pb-8">
        <h1 className="text-2xl font-bold tracking-tight">Admin users</h1>
        <p className="mt-1 text-sm text-neutral-500">Administrators aren&rsquo;t a separate account type — they&rsquo;re regular users holding one or more roles.</p>
        <div className="mt-5">
          <AdminUsersSearch />
        </div>
      </div>
    </AdminShell>
  );
}
