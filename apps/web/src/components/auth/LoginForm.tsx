'use client';

import { Eye, EyeOff, LoaderCircle } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';

import { ApiError, NetworkError } from '@/lib/api-client';
import { useAuth } from '@/lib/auth/AuthContext';
import { Notice } from '@/components/ui/Notice';

type Step = { kind: 'credentials' } | { kind: 'two-factor'; challengeToken: string };

function describeError(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof NetworkError) return error.message;
  return 'Something went wrong. Please try again.';
}

/** Only ever follow a same-origin relative path — never an absolute/protocol-relative URL, which would make `?redirect=` an open-redirect vector. */
function safeRedirectTarget(raw: string | null): string {
  if (raw && raw.startsWith('/') && !raw.startsWith('//')) return raw;
  return '/dashboard';
}

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTarget = safeRedirectTarget(searchParams.get('redirect'));
  const { login, loginWithTwoFactor } = useAuth();
  const [step, setStep] = useState<Step>({ kind: 'credentials' });
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCredentialsSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true); setError(null);
    try {
      const outcome = await login(email.trim(), password);
      if (outcome.twoFactorRequired) setStep({ kind: 'two-factor', challengeToken: outcome.challengeToken });
      else router.replace(redirectTarget);
    } catch (err) { setError(describeError(err)); }
    finally { setSubmitting(false); }
  }

  async function handleTwoFactorSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (submitting || step.kind !== 'two-factor') return;
    setSubmitting(true); setError(null);
    try { await loginWithTwoFactor(step.challengeToken, code); router.replace(redirectTarget); }
    catch (err) { setError(describeError(err)); }
    finally { setSubmitting(false); }
  }

  if (step.kind === 'two-factor') {
    return (
      <form onSubmit={handleTwoFactorSubmit} className="space-y-5" noValidate>
        <div><label htmlFor="code" className="text-sm font-semibold text-neutral-800">Two-factor code</label><p className="mt-1 text-xs text-neutral-500">Enter the 6-digit code from your authenticator app.</p>
          <input id="code" inputMode="numeric" autoComplete="one-time-code" required value={code} onChange={(e) => setCode(e.target.value)} className="mt-2 w-full rounded-xl border border-neutral-200 bg-white px-4 py-3.5 text-lg tracking-widest outline-none focus:ring-2 focus:ring-brand-500" />
        </div>
        {error && <Notice text={error} />}
        <button type="submit" disabled={submitting} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-brand-500 px-4 py-3.5 font-bold text-navy-950 transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-60">{submitting && <LoaderCircle className="h-4 w-4 animate-spin" />}Verify and sign in</button>
        <button type="button" onClick={() => { setStep({ kind: 'credentials' }); setError(null); }} className="w-full text-center text-sm font-semibold text-neutral-500 hover:text-neutral-800">Back</button>
      </form>
    );
  }

  return (
    <form onSubmit={handleCredentialsSubmit} className="space-y-5" noValidate>
      <div><label htmlFor="email" className="text-sm font-semibold text-neutral-800">Email address</label>
        <input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="mt-2 w-full rounded-xl border border-neutral-200 bg-white px-4 py-3.5 outline-none focus:ring-2 focus:ring-brand-500" placeholder="you@example.com" />
      </div>
      <div><div className="flex items-center justify-between"><label htmlFor="password" className="text-sm font-semibold text-neutral-800">Password</label><Link href="/forgot-password" className="text-xs font-bold text-brand-700 hover:text-brand-600">Forgot password?</Link></div>
        <div className="relative mt-2"><input id="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} className="w-full rounded-xl border border-neutral-200 bg-white px-4 py-3.5 pr-12 outline-none focus:ring-2 focus:ring-brand-500" placeholder="Your password" />
          <button type="button" onClick={() => setShowPassword(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 p-2 text-neutral-400" aria-label="Toggle password visibility">{showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>
        </div>
      </div>
      {error && <Notice text={error} />}
      <button type="submit" disabled={submitting} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-brand-500 px-4 py-3.5 font-bold text-navy-950 shadow-lg shadow-brand-500/20 transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-60">
        {submitting && <LoaderCircle className="h-4 w-4 animate-spin" />}Log in
      </button>
    </form>
  );
}
