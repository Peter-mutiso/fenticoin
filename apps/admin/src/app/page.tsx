'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

import { useAuth } from '@/lib/auth/AuthContext';

export default function RootPage() {
  const router = useRouter();
  const { status } = useAuth();

  useEffect(() => {
    if (status === 'loading') return;
    router.replace(status === 'authenticated' ? '/dashboard' : '/login');
  }, [status, router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-navy-950">
      <p className="text-sm text-white/50">Loading…</p>
    </div>
  );
}
