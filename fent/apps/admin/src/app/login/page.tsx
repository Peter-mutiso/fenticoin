'use client';

import { ShieldHalf } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

import { AdminLoginForm } from '@/components/auth/AdminLoginForm';
import { useAuth } from '@/lib/auth/AuthContext';

export default function LoginPage() {
  const router = useRouter();
  const { status } = useAuth();

  useEffect(() => {
    if (status === 'authenticated') router.replace('/dashboard');
  }, [status, router]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-navy-950 px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-2">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-500 text-white">
            <ShieldHalf className="h-6 w-6" aria-hidden="true" />
          </span>
          <p className="text-lg font-bold tracking-tight text-white">FentiCoin Admin</p>
        </div>

        <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm sm:p-8">
          <h1 className="text-xl font-bold text-neutral-900">Log in</h1>
          <p className="mt-1 text-sm text-neutral-500">Administrative access only.</p>

          <div className="mt-6">
            <AdminLoginForm />
          </div>
        </div>
      </div>
    </main>
  );
}
