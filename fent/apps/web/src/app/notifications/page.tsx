import { AppShell } from '@/components/layout/AppShell';
import { NotificationList } from '@/components/notifications/NotificationList';

export default function NotificationsPage() {
  return (
    <AppShell requireAuth>
      <div className="pb-8">
        <h1 className="text-3xl font-bold tracking-tight">Notifications</h1>
        <div className="mt-5">
          <NotificationList />
        </div>
      </div>
    </AppShell>
  );
}
