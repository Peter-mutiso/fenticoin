'use client';

import { useParams } from 'next/navigation';

import { AdminShell } from '@/components/layout/AdminShell';
import { InstrumentDetailView } from '@/components/markets/InstrumentDetailView';

export default function InstrumentDetailPage() {
  const params = useParams<{ id: string }>();

  return (
    <AdminShell>
      <div className="pb-8">
        <InstrumentDetailView instrumentId={params.id} />
      </div>
    </AdminShell>
  );
}
