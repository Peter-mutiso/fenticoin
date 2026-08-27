'use client';

import { ArrowLeft, CheckCircle2, LoaderCircle, Mail } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import { Logo } from '@/components/layout/Logo';
import { ApiError, NetworkError, forgotPassword } from '@/lib/api-client';
import { Notice } from '@/components/ui/Notice';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true); setError(null);
    try { await forgotPassword(email.trim()); setDone(true); }
    catch (err) { setError(err instanceof ApiError || err instanceof NetworkError ? err.message : 'Unable to process your request.'); }
    finally { setSubmitting(false); }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-white px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-8 flex justify-center"><Logo /></div>
        <div className="rounded-3xl border border-neutral-200 bg-white p-7 shadow-[0_24px_70px_rgba(15,23,42,.08)] sm:p-9">
          {done ? (
            <div className="text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-50 text-brand-600"><CheckCircle2 className="h-6 w-6" /></div>
              <h1 className="mt-5 text-2xl font-bold">Check your email</h1>
              <p className="mt-2 text-sm leading-6 text-neutral-500">If an account exists for that address, you will receive instructions to reset your password.</p>
              <Link href="/login" className="mt-7 inline-flex items-center gap-2 font-bold text-brand-600"><ArrowLeft className="h-4 w-4" /> Back to login</Link>
            </div>
          ) : (
            <>
              <div className="mb-7"><div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-50 text-brand-600"><Mail className="h-5 w-5" /></div><h1 className="text-2xl font-bold">Reset your password</h1><p className="mt-2 text-sm leading-6 text-neutral-500">Enter your email and we&rsquo;ll send password reset instructions if an account exists.</p></div>
              <form onSubmit={submit} className="space-y-5">
                <div><label htmlFor="email" className="text-sm font-semibold">Email address</label><input id="email" type="email" required value={email} onChange={e => setEmail(e.target.value)} className="mt-2 w-full rounded-xl border border-neutral-200 bg-white px-4 py-3.5 outline-none focus:ring-2 focus:ring-brand-500" placeholder="you@example.com" /></div>
                {error && <Notice text={error} />}
                <button disabled={submitting} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-brand-500 px-4 py-3.5 font-bold text-white transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-60">{submitting && <LoaderCircle className="h-4 w-4 animate-spin" />}Send reset instructions</button>
              </form>
              <p className="mt-6 text-center text-sm text-neutral-500"><Link href="/login" className="font-bold text-brand-600">Back to login</Link></p>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
