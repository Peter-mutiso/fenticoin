'use client';

import { useState } from 'react';

import { forgotPassword } from '@/lib/api-client';
import { describeApiError } from '@/lib/api-errors';
import { Notice } from '@/components/ui/Notice';
import { AccountSection } from './AccountSection';

/** There is no authenticated "change password" endpoint — only the token-based forgot/reset flow — so this is a link to that flow, not a fake current/new-password form. */
export function PasswordSection({ email }: { email: string }) {
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSend() {
    setSubmitting(true);
    setError(null);
    try {
      await forgotPassword(email);
      setSent(true);
    } catch (thrown) {
      setError(describeApiError(thrown).title);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AccountSection title="Password" description="Change your password by requesting a reset link — there's no in-app password change yet.">
      {sent ? (
        <p className="text-sm font-semibold text-brand-600">Check {email} for a password reset link.</p>
      ) : (
        <button type="button" onClick={handleSend} disabled={submitting} className="rounded-full bg-brand-500 px-4 py-2 text-sm font-bold text-white transition hover:bg-brand-600 disabled:opacity-60">
          {submitting ? 'Sending…' : 'Send password reset email'}
        </button>
      )}
      {error && <Notice text={error} className="mt-3" />}
    </AccountSection>
  );
}
