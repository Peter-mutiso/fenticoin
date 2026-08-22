'use client';

import { Suspense } from 'react';
import { useParams, useSearchParams } from 'next/navigation';

import { AdminShell } from '@/components/layout/AdminShell';
import { UserDetailView } from '@/components/users/UserDetailView';

function UserDetailPageInner() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();

  return <UserDetailView userId={params.id} initialTab={searchParams.get('tab')} />;
}

export default function UserDetailPage() {
  return (
    <AdminShell>
      <div className="pb-8">
        <Suspense>
          <UserDetailPageInner />
        </Suspense>
      </div>
    </AdminShell>
  );
}
