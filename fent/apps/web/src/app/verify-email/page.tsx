'use client';

import { AlertCircle, CheckCircle2, LoaderCircle, MailCheck } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';

import { Logo } from '@/components/layout/Logo';
import { ApiError, NetworkError, verifyEmail } from '@/lib/api-client';
import { useAuth } from '@/lib/auth/AuthContext';

type State = 'verifying' | 'success' | 'error' | 'missing-token';

function describeError(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof NetworkError) return error.message;
  return 'We could not verify your email. The link may have expired.';
}

function VerifyEmailContent() {
  const token = useSearchParams().get('token');
  const { status } = useAuth();
  const [state, setState] = useState<State>('verifying');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setState('missing-token');
      return;
    }
    let cancelled = false;
    verifyEmail(token)
      .then(() => {
        if (!cancelled) setState('success');
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(describeError(err));
          setState('error');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const continueHref = status === 'authenticated' ? '/dashboard' : '/login';

  if (state === 'verifying') {
    return (
      <div className="text-center">
        <LoaderCircle className="mx-auto h-8 w-8 animate-spin text-brand-500" />
        <p className="mt-4 text-sm text-neutral-500">Verifying your email…</p>
      </div>
    );
  }

  if (state === 'missing-token' || state === 'error') {
    return (
      <div className="text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-red-50 text-red-600">
          <AlertCircle className="h-6 w-6" />
        </div>
        <h1 className="mt-5 text-2xl font-bold">We couldn&rsquo;t verify your email</h1>
        <p className="mt-2 text-sm leading-6 text-neutral-500">{state === 'missing-token' ? 'This link is missing its verification token.' : error}</p>
        <Link href={continueHref} className="mt-7 inline-block rounded-full bg-brand-500 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-brand-600">
          Continue to {status === 'authenticated' ? 'dashboard' : 'login'}
        </Link>
      </div>
    );
  }

  return (
    <div className="text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
        <CheckCircle2 className="h-6 w-6" />
      </div>
      <h1 className="mt-5 text-2xl font-bold">Email verified</h1>
      <p className="mt-2 text-sm leading-6 text-neutral-500">Thanks — your email address has been confirmed.</p>
      <Link href={continueHref} className="mt-7 inline-block rounded-full bg-brand-500 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-brand-600">
        Continue to {status === 'authenticated' ? 'dashboard' : 'login'}
      </Link>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f7f9fc] px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-8 flex justify-center">
          <Logo />
        </div>
        <div className="rounded-3xl border border-neutral-200 bg-white p-7 shadow-[0_24px_70px_rgba(15,23,42,.08)] sm:p-9">
          <div className="mb-2 flex justify-center">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
              <MailCheck className="h-5 w-5" />
            </div>
          </div>
          <Suspense>
            <VerifyEmailContent />
          </Suspense>
        </div>
      </div>
    </main>
  );
}
