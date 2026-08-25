import { AdminShell } from '@/components/layout/AdminShell';
import { NotImplementedNotice } from '@/components/ui/NotImplementedNotice';

export default function SecuritySettingsPage() {
  return (
    <AdminShell>
      <div className="pb-8">
        <h1 className="text-2xl font-bold tracking-tight">Security settings</h1>
        <div className="mt-5">
          <NotImplementedNotice
            title="Security policy management isn't available yet"
            description="No rate-limiting module or IP allowlist exists in the backend, and password policy is not admin-configurable today."
          />
        </div>
      </div>
    </AdminShell>
  );
}
