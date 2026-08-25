'use client';

import { useParams } from 'next/navigation';

import { AppShell } from '@/components/layout/AppShell';
import { InstrumentDetail } from '@/components/markets/InstrumentDetail';

export default function MarketDetailPage() {
  const params = useParams<{ instrumentId: string }>();

  return (
    <AppShell>
      <div className="pb-8">
        <InstrumentDetail instrumentId={params.instrumentId} />
      </div>
    </AppShell>
  );
}
