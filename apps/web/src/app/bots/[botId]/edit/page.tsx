'use client';

import { useParams } from 'next/navigation';

import { AppShell } from '@/components/layout/AppShell';
import { EditBotForm } from '@/components/bots/EditBotForm';

export default function EditBotPage() {
  const params = useParams<{ botId: string }>();

  return (
    <AppShell requireAuth>
      <div className="mx-auto max-w-lg pb-8">
        <h1 className="text-2xl font-bold tracking-tight">Edit bot</h1>
        <div className="mt-5">
          <EditBotForm botId={params.botId} />
        </div>
      </div>
    </AppShell>
  );
}
