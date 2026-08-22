'use client';

import { AlertCircle, LoaderCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { ApiError, NetworkError } from '@/lib/api-client';
import { useAuth } from '@/lib/auth/AuthContext';

type Step = { kind: 'credentials' } | { kind: 'two-factor'; challengeToken: string };

function describeError(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof NetworkError) return error.message;
  return 'Something went wrong. Please try again.';
}

/**
 * Same `/auth/login` endpoint as the user-facing app — there is no
 * separate admin login. The one thing that differs: after a successful
 * login, this checks whether the account holds ANY administrative
 * permission at all. If not, it logs the session back out immediately and
 * shows an explicit "no administrative access" message rather than
 * silently landing on a blank dashboard. This is a UX nicety only — every
 * admin API call is independently checked server-side by `PermissionsGuard`
 * regardless of what this screen decided to show.
 */
export function AdminLoginForm() {
  const router = useRouter();
  const { login, loginWithTwoFactor, logout } = useAuth();

  const [step, setStep] = useState<Step>({ kind: 'credentials' });
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notAuthorized, setNotAuthorized] = useState(false);

  async function handleAuthorizedEntry(permissions: string[]) {
    if (permissions.length === 0) {
      setNotAuthorized(true);
      await logout();
      return;
    }
    router.push('/dashboard');
  }

  async function handleCredentialsSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    setNotAuthorized(false);
    try {
      const outcome = await login(email, password);
      if (outcome.twoFactorRequired) {
        setStep({ kind: 'two-factor', challengeToken: outcome.challengeToken });
      } else {
        await handleAuthorizedEntry(outcome.permissions);
      }
    } catch (err) {
      setError(describeError(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleTwoFactorSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (submitting || step.kind !== 'two-factor') return;
    setSubmitting(true);
    setError(null);
    setNotAuthorized(false);
    try {
      const permissions = await loginWithTwoFactor(step.challengeToken, code);
      await handleAuthorizedEntry(permissions);
    } catch (err) {
      setError(describeError(err));
    } finally {
      setSubmitting(false);
    }
  }

  if (notAuthorized) {
    return (
      <div className="space-y-4">
        <div role="alert" className="flex gap-2 rounded-xl bg-loss-50 p-3 text-sm text-loss-500">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          This account has no administrative access. Contact a super admin if you believe this is a mistake.
        </div>
        <button
          type="button"
          onClick={() => {
            setNotAuthorized(false);
            setStep({ kind: 'credentials' });
          }}
          className="w-full text-center text-sm font-semibold text-neutral-500 hover:text-neutral-700"
        >
          Try a different account
        </button>
      </div>
    );
  }

  if (step.kind === 'two-factor') {
    return (
      <form onSubmit={handleTwoFactorSubmit} className="space-y-4" noValidate>
        <div>
          <label htmlFor="code" className="block text-sm font-semibold text-neutral-900">
            Two-factor code
          </label>
          <p className="mt-1 text-xs text-neutral-500">Enter the 6-digit code from your authenticator app.</p>
          <input
            id="code"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            required
            value={code}
            onChange={(event) => setCode(event.target.value)}
            className="mt-2 w-full rounded-xl border border-neutral-200 px-3 py-3 text-lg tracking-widest outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>

        {error && (
          <div role="alert" className="flex gap-2 rounded-xl bg-loss-50 p-3 text-sm text-loss-500">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="flex w-full items-center justify-center gap-2 rounded-full bg-brand-500 px-4 py-3 font-bold text-white transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting && <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />}
          Verify and sign in
        </button>
        <button
          type="button"
          onClick={() => {
            setStep({ kind: 'credentials' });
            setError(null);
          }}
          className="w-full text-center text-sm font-semibold text-neutral-500 hover:text-neutral-700"
        >
          Back
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={handleCredentialsSubmit} className="space-y-4" noValidate>
      <div>
        <label htmlFor="email" className="block text-sm font-semibold text-neutral-900">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="mt-2 w-full rounded-xl border border-neutral-200 px-3 py-3 outline-none focus:ring-2 focus:ring-brand-500"
        />
      </div>

      <div>
        <label htmlFor="password" className="block text-sm font-semibold text-neutral-900">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="mt-2 w-full rounded-xl border border-neutral-200 px-3 py-3 outline-none focus:ring-2 focus:ring-brand-500"
        />
      </div>

      {error && (
        <div role="alert" className="flex gap-2 rounded-xl bg-loss-50 p-3 text-sm text-loss-500">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="flex w-full items-center justify-center gap-2 rounded-full bg-brand-500 px-4 py-3 font-bold text-white transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {submitting && <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />}
        Log in
      </button>
    </form>
  );
}
