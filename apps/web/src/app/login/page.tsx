'use client';

import Link from 'next/link';
import { ArrowLeft, LockKeyhole } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Suspense, useEffect } from 'react';

import { LoginForm } from '@/components/auth/LoginForm';
import { Logo } from '@/components/layout/Logo';
import { useAuth } from '@/lib/auth/AuthContext';

export default function LoginPage() {
  const router = useRouter();
  const { status } = useAuth();

  useEffect(() => {
    if (status === 'authenticated') router.replace('/dashboard');
  }, [status, router]);

  return (
    <main className="min-h-screen bg-[#f7f9fc]">
      <div className="mx-auto grid min-h-screen max-w-6xl lg:grid-cols-[.9fr_1.1fr]">
        <section className="hidden flex-col justify-between bg-[#07111f] p-10 text-white lg:flex xl:p-14">
          <Logo inverse />
          <div>
            <p className="text-sm font-bold uppercase tracking-[.18em] text-brand-400">Welcome back</p>
            <h1 className="mt-4 max-w-md text-5xl font-bold tracking-tight">Your markets, portfolio and positions in one place.</h1>
            <p className="mt-6 max-w-md leading-7 text-white/55">Sign in to continue to the FentiCoin trading platform.</p>
          </div>
          <p className="text-xs text-white/35">Protect your credentials and never share your password.</p>
        </section>
        <section className="flex items-center px-4 py-8 sm:px-8 lg:px-12">
          <div className="mx-auto w-full max-w-md">
            <div className="mb-8 flex items-center justify-between lg:hidden">
              <Logo />
              <Link href="/" className="flex items-center gap-1 text-sm font-semibold text-neutral-500"><ArrowLeft className="h-4 w-4" /> Home</Link>
            </div>
            <div className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-[0_24px_70px_rgba(15,23,42,.08)] sm:p-9">
              <div className="mb-7">
                <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-50 text-brand-600"><LockKeyhole className="h-5 w-5" /></div>
                <h1 className="text-2xl font-bold tracking-tight">Log in</h1>
                <p className="mt-2 text-sm leading-6 text-neutral-500">Access your account and continue where you left off.</p>
              </div>
              <Suspense>
                <LoginForm />
              </Suspense>
              <div className="mt-6 flex items-center justify-center gap-1 text-sm text-neutral-500">
                <span>Don&rsquo;t have an account?</span>
                <Link href="/signup" className="font-bold text-brand-600 hover:text-brand-700">Create one</Link>
              </div>
              <p className="mt-2 text-center text-xs text-neutral-400">
                New here?{' '}
                <Link href="/signup" className="font-semibold text-neutral-600 hover:text-neutral-800">
                  Create a free account to try Demo Mode
                </Link>
              </p>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
