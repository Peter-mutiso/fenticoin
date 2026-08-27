'use client';

import { AlertCircle, ArrowLeft, CheckCircle2, Eye, EyeOff, KeyRound, LoaderCircle } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';

import { Logo } from '@/components/layout/Logo';
import { ApiError, NetworkError, resetPassword } from '@/lib/api-client';
import { Notice } from '@/components/ui/Notice';

function describeError(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof NetworkError) return error.message;
  return 'We could not reset your password. Please try again.';
}

function ResetPasswordForm() {
  const router = useRouter();
  const token = useSearchParams().get('token');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!token) {
    return (
      <div className="text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-loss-50 text-loss-500">
          <AlertCircle className="h-6 w-6" />
        </div>
        <h1 className="mt-5 text-2xl font-bold">This link is invalid or has expired</h1>
        <p className="mt-2 text-sm leading-6 text-neutral-500">Request a new password reset link and try again.</p>
        <Link href="/forgot-password" className="mt-7 inline-flex items-center gap-2 font-bold text-brand-600">
          <ArrowLeft className="h-4 w-4" /> Request a new link
        </Link>
      </div>
    );
  }

  if (done) {
    return (
      <div className="text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
          <CheckCircle2 className="h-6 w-6" />
        </div>
        <h1 className="mt-5 text-2xl font-bold">Password reset</h1>
        <p className="mt-2 text-sm leading-6 text-neutral-500">Your password has been changed. Please log in with your new password.</p>
        <button
          type="button"
          onClick={() => router.replace('/login')}
          className="mt-7 inline-flex items-center gap-2 rounded-full bg-brand-500 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-brand-600"
        >
          Go to login
        </button>
      </div>
    );
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (submitting || !token) return;
    setError(null);

    if (password.length < 12) return setError('Password must contain at least 12 characters.');
    if (password !== confirm) return setError('Passwords do not match.');

    setSubmitting(true);
    try {
      await resetPassword(token, password);
      setDone(true);
    } catch (err) {
      setError(describeError(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <div className="mb-7">
        <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
          <KeyRound className="h-5 w-5" />
        </div>
        <h1 className="text-2xl font-bold">Set a new password</h1>
        <p className="mt-2 text-sm leading-6 text-neutral-500">Choose a new password for your account.</p>
      </div>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <div>
          <label htmlFor="new-password" className="text-sm font-semibold text-neutral-800">New password</label>
          <div className="relative mt-2">
            <input
              id="new-password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl border border-neutral-200 bg-white px-4 py-3.5 pr-12 outline-none focus:ring-2 focus:ring-brand-500"
              placeholder="At least 12 characters"
            />
            <button type="button" onClick={() => setShowPassword((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 p-2 text-neutral-400" aria-label="Toggle password visibility">
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>
        <div>
          <label htmlFor="confirm-password" className="text-sm font-semibold text-neutral-800">Confirm new password</label>
          <input
            id="confirm-password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="new-password"
            required
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className="mt-2 w-full rounded-xl border border-neutral-200 bg-white px-4 py-3.5 outline-none focus:ring-2 focus:ring-brand-500"
            placeholder="Repeat your new password"
          />
        </div>
        {error && <Notice text={error} />}
        <button
          type="submit"
          disabled={submitting}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-brand-500 px-4 py-3.5 font-bold text-white transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting && <LoaderCircle className="h-4 w-4 animate-spin" />}
          Reset password
        </button>
      </form>
    </>
  );
}

export default function ResetPasswordPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-white px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-8 flex justify-center">
          <Logo />
        </div>
        <div className="rounded-3xl border border-neutral-200 bg-white p-7 shadow-[0_24px_70px_rgba(15,23,42,.08)] sm:p-9">
          <Suspense>
            <ResetPasswordForm />
          </Suspense>
        </div>
      </div>
    </main>
  );
}
