'use client';

import { useParams } from 'next/navigation';

import { AppShell } from '@/components/layout/AppShell';
import { BotDetail } from '@/components/bots/BotDetail';

export default function BotDetailPage() {
  const params = useParams<{ botId: string }>();

  return (
    <AppShell requireAuth>
      <div className="pb-8">
        <BotDetail botId={params.botId} />
      </div>
    </AppShell>
  );
}
