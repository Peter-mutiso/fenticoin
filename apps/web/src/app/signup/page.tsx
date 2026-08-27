'use client';

import { ArrowRight, Check, Eye, EyeOff, LoaderCircle, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Logo } from '@/components/layout/Logo';
import { ApiError, NetworkError } from '@/lib/api-client';
import { useAuth } from '@/lib/auth/AuthContext';
import { Notice } from '@/components/ui/Notice';

function describeError(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof NetworkError) return error.message;
  return 'We could not create your account. Please try again.';
}

export default function SignupPage() {
  const router = useRouter();
  const { register } = useAuth();
  const [email, setEmail] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [agree, setAgree] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const passwordStrong = password.length >= 12;
  const passwordsMatch = password.length > 0 && password === confirm;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (submitting) return;
    setError(null);

    if (!passwordStrong) return setError('Password must contain at least 12 characters.');
    if (!passwordsMatch) return setError('Passwords do not match.');
    if (!agree) return setError('Please accept the terms and responsible-use acknowledgement.');

    setSubmitting(true);
    try {
      await register(email.trim(), password, dateOfBirth || undefined);
      router.replace('/dashboard');
    } catch (err) {
      setError(describeError(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-white">
      <div className="mx-auto grid min-h-screen max-w-6xl lg:grid-cols-[1.05fr_.95fr]">
        <section className="hidden flex-col justify-between bg-navy-950 p-10 text-white lg:flex xl:p-14">
          <Logo inverse />
          <div className="max-w-xl">
            <p className="mb-4 text-sm font-semibold uppercase tracking-[0.18em] text-brand-400">Start trading with FentiCoin</p>
            <h1 className="text-5xl font-bold tracking-tight xl:text-6xl">A cleaner way to follow markets and manage your trades.</h1>
            <p className="mt-6 max-w-lg text-lg leading-8 text-white/60">
              One account for markets, portfolio management and the platform’s supported Rise/Fall, Higher/Lower and Up/Down experiences.
            </p>
            <div className="mt-10 grid gap-4 sm:grid-cols-2">
              {['Professional market interface', 'Secure account controls', 'Transparent portfolio activity', 'Mobile-ready experience'].map((item) => (
                <div key={item} className="flex items-center gap-3 text-sm text-white/75">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/10"><Check className="h-4 w-4 text-brand-400" /></span>
                  {item}
                </div>
              ))}
            </div>
          </div>
          <p className="text-xs text-white/35">Trading and betting involve risk. Only use funds you can afford to lose.</p>
        </section>

        <section className="flex items-center px-4 py-8 sm:px-8 lg:px-12">
          <div className="mx-auto w-full max-w-md">
            <div className="mb-8 flex items-center justify-between lg:hidden">
              <Logo />
              <Link href="/login" className="text-sm font-semibold text-neutral-600">Log in</Link>
            </div>

            <div className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-[0_24px_70px_rgba(15,23,42,.08)] sm:p-9">
              <div className="mb-7">
                <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-50 text-brand-600"><ShieldCheck className="h-5 w-5" /></div>
                <h2 className="text-2xl font-bold tracking-tight text-neutral-950">Create your account</h2>
                <p className="mt-2 text-sm leading-6 text-neutral-500">Set up your FentiCoin account in a few simple steps.</p>
              </div>

              <form onSubmit={submit} className="space-y-4" noValidate>
                <div>
                  <label htmlFor="signup-email" className="text-sm font-semibold text-neutral-800">Email address</label>
                  <input id="signup-email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)}
                    className="mt-2 w-full rounded-xl border border-neutral-200 bg-white px-4 py-3.5 outline-none transition focus:ring-2 focus:ring-brand-500" placeholder="you@example.com" />
                </div>
                <div>
                  <label htmlFor="signup-dob" className="text-sm font-semibold text-neutral-800">Date of birth <span className="font-normal text-neutral-400">(optional)</span></label>
                  <input id="signup-dob" type="date" value={dateOfBirth} onChange={(e) => setDateOfBirth(e.target.value)}
                    className="mt-2 w-full rounded-xl border border-neutral-200 bg-white px-4 py-3.5 outline-none transition focus:ring-2 focus:ring-brand-500" />
                </div>
                <div>
                  <label htmlFor="signup-password" className="text-sm font-semibold text-neutral-800">Password</label>
                  <div className="relative mt-2">
                    <input id="signup-password" type={showPassword ? 'text' : 'password'} autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)}
                      className="w-full rounded-xl border border-neutral-200 bg-white px-4 py-3.5 pr-12 outline-none transition focus:ring-2 focus:ring-brand-500" placeholder="At least 12 characters" />
                    <button type="button" onClick={() => setShowPassword((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 p-2 text-neutral-400" aria-label="Toggle password visibility">{showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>
                  </div>
                </div>
                <div>
                  <label htmlFor="signup-confirm" className="text-sm font-semibold text-neutral-800">Confirm password</label>
                  <div className="relative mt-2">
                    <input id="signup-confirm" type={showConfirm ? 'text' : 'password'} autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)}
                      className="w-full rounded-xl border border-neutral-200 bg-white px-4 py-3.5 pr-12 outline-none transition focus:ring-2 focus:ring-brand-500" placeholder="Repeat your password" />
                    <button type="button" onClick={() => setShowConfirm((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 p-2 text-neutral-400" aria-label="Toggle confirmation visibility">{showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>
                  </div>
                </div>

                <label className="flex cursor-pointer items-start gap-3 rounded-2xl bg-neutral-50 p-3 text-xs leading-5 text-neutral-500">
                  <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-1 h-4 w-4 accent-brand-500" />
                  <span>I confirm that I am eligible to use the service and agree to the platform terms and responsible-use requirements.</span>
                </label>

                {error && <Notice text={error} />}

                <button type="submit" disabled={submitting} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-brand-500 px-4 py-3.5 font-bold text-white shadow-lg transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-60">
                  {submitting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <>Create account <ArrowRight className="h-4 w-4" /></>}
                </button>
              </form>

              <p className="mt-6 text-center text-sm text-neutral-500">
                Already have an account? <Link href="/login" className="font-bold text-brand-600 hover:text-brand-700">Log in</Link>
              </p>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
