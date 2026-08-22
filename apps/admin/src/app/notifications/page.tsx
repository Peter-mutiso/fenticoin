import { AdminShell } from '@/components/layout/AdminShell';
import { NotImplementedNotice } from '@/components/ui/NotImplementedNotice';

export default function AdminNotificationsPage() {
  return (
    <AdminShell>
      <div className="pb-8">
        <h1 className="text-2xl font-bold tracking-tight">Notifications</h1>
        <div className="mt-5">
          <NotImplementedNotice
            title="Admin notification management isn't available yet"
            description="There is no backend for sending broadcast notifications to users, managing notification templates, or viewing delivery logs from this panel."
          />
        </div>
      </div>
    </AdminShell>
  );
}
