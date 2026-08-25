import { AdminShell } from '@/components/layout/AdminShell';
import { UsersList } from '@/components/users/UsersList';

export default function UsersPage() {
  return (
    <AdminShell>
      <div className="pb-8">
        <h1 className="text-2xl font-bold tracking-tight">Users</h1>
        <div className="mt-5">
          <UsersList />
        </div>
      </div>
    </AdminShell>
  );
}
