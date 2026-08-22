import { Suspense } from 'react';

import { AppShell } from '@/components/layout/AppShell';
import { HomeDashboard } from '@/components/home/HomeDashboard';

/** The authenticated trading home — balance, quick actions, featured markets, and the bet builder. Anonymous visitors are redirected to `/login`; the public marketing page lives at `/`. */
export default function DashboardPage() {
  return (
    <AppShell requireAuth>
      <Suspense>
        <HomeDashboard />
      </Suspense>
    </AppShell>
  );
}
