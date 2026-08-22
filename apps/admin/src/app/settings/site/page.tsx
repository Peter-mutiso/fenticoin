import { AdminShell } from '@/components/layout/AdminShell';
import { NotImplementedNotice } from '@/components/ui/NotImplementedNotice';

export default function SiteSettingsPage() {
  return (
    <AdminShell>
      <div className="pb-8">
        <h1 className="text-2xl font-bold tracking-tight">Site settings</h1>
        <div className="mt-5">
          <NotImplementedNotice
            title="Site-wide settings aren't available yet"
            description="No platform-wide configuration store exists (e.g. maintenance mode, global deposit/withdrawal limits, supported currencies). The `settings.manage` permission is reserved for this once it's built."
          />
        </div>
      </div>
    </AdminShell>
  );
}
