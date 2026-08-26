import { Suspense } from 'react';

import { AppShell } from '@/components/layout/AppShell';
import { NewBotForm } from '@/components/bots/NewBotForm';

export default function NewBotPage() {
  return (
    <AppShell requireAuth>
      <div className="mx-auto max-w-lg pb-8">
        <h1 className="text-2xl font-bold tracking-tight">New trading bot</h1>
        <div className="mt-5">
          <Suspense>
            <NewBotForm />
          </Suspense>
        </div>
      </div>
    </AppShell>
  );
}
